import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { postCategories, postTagLinks, postTags, posts } from "@/db/schema/content";
import { prepareBody } from "@/features/content/body";
import {
  checkAdminUser,
  checkAgent,
  checkImages,
  checkListings,
  fieldError,
} from "@/features/content/checks";
import { syncMediaUsage } from "@/features/media/usage";
import { redirectSlugChange } from "@/features/seo/redirects";
import { ActionError } from "@/lib/actions";
import { auditChange, writeAudit, type AuditActor } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { loadPost, postMediaIds } from "./load";
import { postPublishProblems, type ContentProblem, type PostInput } from "./schema";
import { postSlug } from "./write";

const problemsError = (message: string, code: string, problems: ContentProblem[]) => {
  const fieldErrors: Record<string, string[]> = {};
  for (const p of problems) (fieldErrors[p.field] ??= []).push(p.message);
  return new ActionError(message, code, fieldErrors);
};

/** Tag names to tag ids, creating the new ones (same slug = same tag). */
async function syncTags(db: DbOrTx, postId: string, names: string[]): Promise<void> {
  const wanted = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ");
    const slug = slugify(name, 60);
    if (name && !wanted.has(slug)) wanted.set(slug, name);
  }
  const slugs = [...wanted.keys()];
  const ids = new Map<string, string>();
  if (slugs.length) {
    const existing = await db
      .select({ id: postTags.id, slug: postTags.slug })
      .from(postTags)
      .where(and(eq(postTags.agencyId, currentAgencyId()), inArray(postTags.slug, slugs)));
    for (const t of existing) ids.set(t.slug, t.id);
    const missing = slugs.filter((s) => !ids.has(s));
    if (missing.length) {
      const created = await db
        .insert(postTags)
        .values(missing.map((slug) => ({ name: wanted.get(slug)!, slug })))
        .returning({ id: postTags.id, slug: postTags.slug });
      for (const t of created) ids.set(t.slug, t.id);
    }
  }
  await db.delete(postTagLinks).where(eq(postTagLinks.postId, postId));
  if (slugs.length)
    await db.insert(postTagLinks).values(slugs.map((s) => ({ postId, tagId: ids.get(s)! })));
}

async function checkReferences(db: DbOrTx, data: PostInput): Promise<void> {
  await checkImages(db, [
    { id: data.coverId, field: "coverId" },
    { id: data.ogImageId, field: "ogImageId" },
  ]);
  if (data.categoryId) {
    const [c] = await db
      .select({ id: postCategories.id })
      .from(postCategories)
      .where(
        and(eq(postCategories.id, data.categoryId), eq(postCategories.agencyId, currentAgencyId())),
      );
    if (!c) fieldError("categoryId", "This category was deleted. Choose another one.");
  }
  await checkAgent(db, data.authorAgentId, "authorAgentId");
  await checkAdminUser(db, data.authorUserId, "authorUserId");
  await checkListings(db, data.relatedPropertyIds, "relatedPropertyIds");
}

/**
 * Saves the post editor (08 §3). A published post must keep passing the publish rules.
 * Changing the slug of a post that has been public adds a 301 from the old address.
 */
export async function savePostRecord(
  tx: Tx,
  args: {
    id: string;
    data: PostInput;
    expectedUpdatedAt: string;
    actor: AuditActor;
    userId: string;
  },
): Promise<{ updatedAt: string; slug: string; readingMinutes: number }> {
  const loaded = await loadPost(tx, args.id);
  if (!loaded || loaded.row.deletedAt)
    throw new ActionError("This post no longer exists.", "NOT_FOUND");
  const { row, input: before } = loaded;
  if (row.updatedAt.toISOString() !== args.expectedUpdatedAt)
    throw new ActionError(
      "Someone else saved this post since you opened it. Reload to see their changes; yours stay on this page until you do.",
      "CONFLICT",
    );
  const data = args.data;
  await checkReferences(tx, data);
  const body = await prepareBody(tx, data.body);

  if (row.status !== "draft") {
    const problems = postPublishProblems(data);
    if (problems.length)
      throw problemsError(
        row.status === "published"
          ? "This post is published, so these must stay filled in. Fix them, or unpublish it first."
          : "This post is scheduled, so these must stay filled in. Fix them, or unschedule it first.",
        "LIVE_RULES",
        problems,
      );
  }

  // A post that has never been public follows its title until the slug is set by hand.
  const followsTitle = row.publishedAt === null && row.slug === slugify(row.title);
  const slugBase = data.slug && !(followsTitle && data.slug === row.slug) ? data.slug : data.title;
  const slug = await postSlug(tx, slugBase, row.id);

  const [after] = await tx
    .update(posts)
    .set({
      title: data.title,
      excerpt: data.excerpt || null,
      coverId: data.coverId,
      body: body.body,
      bodyHtml: body.bodyHtml,
      readingMinutes: body.readingMinutes,
      categoryId: data.categoryId,
      authorAgentId: data.authorAgentId,
      authorUserId: data.authorUserId,
      relatedPropertyIds: [...new Set(data.relatedPropertyIds)],
      slug,
      seoTitle: data.seoTitle || null,
      seoDescription: data.seoDescription || null,
      canonicalUrl: data.canonicalUrl || null,
      noindex: data.noindex,
      ogImageId: data.ogImageId,
      updatedBy: args.userId,
    })
    .where(eq(posts.id, row.id))
    .returning();
  await syncTags(tx, row.id, data.tags);

  if (row.publishedAt && row.slug !== slug)
    await redirectSlugChange(tx, {
      entity: "post",
      entityId: row.id,
      oldSlug: row.slug,
      newSlug: slug,
      actorId: args.userId,
    });

  await auditChange(tx, {
    actor: args.actor,
    action: "post.update",
    entityType: "post",
    entityId: row.id,
    before,
    after: { ...data, slug, body: body.body },
  });
  await syncMediaUsage(tx, [...postMediaIds(before), ...postMediaIds(data)]);
  return {
    updatedAt: after!.updatedAt.toISOString(),
    slug,
    readingMinutes: body.readingMinutes,
  };
}

export type PostPublishing =
  | { action: "publish"; id: string }
  | { action: "schedule"; id: string; publishAt: string }
  | { action: "unpublish"; id: string };

/**
 * Publish now, schedule for later (the cron publishes it, 13 §2) or take off the site. The
 * rules are checked against the saved post. AI drafts are only ever published by a person.
 */
export async function setPostPublishingRecord(
  tx: Tx,
  input: PostPublishing,
  ctx: { actor: AuditActor; userId: string },
  now = new Date(),
): Promise<{ updatedAt: string; status: string; publishAt: string | null }> {
  const loaded = await loadPost(tx, input.id);
  if (!loaded || loaded.row.deletedAt)
    throw new ActionError("This post no longer exists.", "NOT_FOUND");
  const { row } = loaded;
  const values: Partial<typeof posts.$inferInsert> = { updatedBy: ctx.userId };
  if (input.action === "unpublish") {
    values.status = "draft";
    values.publishAt = null;
  } else {
    const problems = postPublishProblems(loaded.input);
    if (problems.length)
      throw problemsError("Not ready to publish yet.", "PUBLISH_RULES", problems);
    if (input.action === "publish") {
      values.status = "published";
      values.publishAt = null;
      values.publishedAt = row.publishedAt ?? now;
    } else {
      const at = new Date(input.publishAt);
      if (at.getTime() <= now.getTime() + 60_000)
        fieldError("publishAt", "Choose a time at least a minute from now, or publish now.");
      values.status = "scheduled";
      values.publishAt = at;
    }
  }
  const [after] = await tx.update(posts).set(values).where(eq(posts.id, row.id)).returning();
  await auditChange(tx, {
    actor: ctx.actor,
    action: `post.${input.action}`,
    entityType: "post",
    entityId: row.id,
    before: { status: row.status, publishAt: row.publishAt, publishedAt: row.publishedAt },
    after: { status: after!.status, publishAt: after!.publishAt, publishedAt: after!.publishedAt },
  });
  return {
    updatedAt: after!.updatedAt.toISOString(),
    status: after!.status,
    publishAt: after!.publishAt?.toISOString() ?? null,
  };
}

/** Delete: a post that is on the site is unpublished first. */
export async function deletePostRecord(
  tx: Tx,
  id: string,
  ctx: { actor: AuditActor },
): Promise<void> {
  const loaded = await loadPost(tx, id);
  if (!loaded) throw new ActionError("This post no longer exists.", "NOT_FOUND");
  if (loaded.row.status === "published")
    throw new ActionError("Unpublish this post before deleting it.", "PUBLISHED");
  await tx.delete(posts).where(eq(posts.id, id));
  await writeAudit(tx, {
    actor: ctx.actor,
    action: "post.delete",
    entityType: "post",
    entityId: id,
    before: { title: loaded.row.title, slug: loaded.row.slug, status: loaded.row.status },
  });
  await syncMediaUsage(tx, postMediaIds(loaded.input));
}
