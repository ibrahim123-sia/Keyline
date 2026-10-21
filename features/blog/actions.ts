"use server";

import { and, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { postCategories, postTagLinks, postTags, posts } from "@/db/schema/content";
import { checkImages } from "@/features/content/checks";
import { syncMediaUsage } from "@/features/media/usage";
import { redirectSlugChange } from "@/features/seo/redirects";
import { ActionError, adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { deletePostRecord, savePostRecord, setPostPublishingRecord } from "./save";
import {
  categoryInputSchema,
  newPostSchema,
  postInputSchema,
  postPublishingSchema,
  tagNameSchema,
} from "./schema";
import { categorySlug, postSlug, revalidatePost } from "./write";

/** "New post" (08 §3): a draft with this title, by the admin who made it; the editor opens next. */
export const createPost = adminAction(newPostSchema, { write: true }, async ({ title }, ctx) => {
  const db = await getDb();
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(posts)
      .values({
        title,
        slug: await postSlug(tx, title, null),
        authorUserId: ctx.user.id,
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      })
      .returning();
    await writeAudit(tx, {
      actor: ctx.actor,
      action: "post.create",
      entityType: "post",
      entityId: row!.id,
      after: { title: row!.title, slug: row!.slug },
    });
    return row!;
  });
  revalidatePost(created.id);
  return { id: created.id };
});

/** The post editor's save (autosave every 10 s and the Save button). */
export const savePost = adminAction(
  z.object({ id: z.uuid(), data: postInputSchema, expectedUpdatedAt: z.iso.datetime() }),
  { write: true },
  async ({ id, data, expectedUpdatedAt }, ctx) => {
    const db = await getDb();
    const result = await db.transaction((tx) =>
      savePostRecord(tx, { id, data, expectedUpdatedAt, actor: ctx.actor, userId: ctx.user.id }),
    );
    revalidatePost(id);
    return result;
  },
);

/** Publish now, schedule or unpublish. */
export const setPostPublishing = adminAction(
  postPublishingSchema,
  { write: true },
  async (input, ctx) => {
    const db = await getDb();
    const result = await db.transaction((tx) =>
      setPostPublishingRecord(tx, input, { actor: ctx.actor, userId: ctx.user.id }),
    );
    revalidatePost(input.id);
    return result;
  },
);

export const deletePost = adminAction(
  z.object({ id: z.uuid() }),
  { write: true },
  async ({ id }, ctx) => {
    const db = await getDb();
    await db.transaction((tx) => deletePostRecord(tx, id, { actor: ctx.actor }));
    revalidatePost(id);
    return { id };
  },
);

/* Categories -------------------------------------------------------------------------- */

/** Add or edit a category; a changed slug keeps the old category page working (301). */
export const saveCategory = adminAction(
  z.object({ id: z.uuid().nullable(), data: categoryInputSchema }),
  { write: true },
  async ({ id, data }, ctx) => {
    const db = await getDb();
    const saved = await db.transaction(async (tx) => {
      await checkImages(tx, [{ id: data.ogImageId, field: "ogImageId" }]);
      const slug = await categorySlug(tx, data.slug || data.name, id);
      const values = {
        name: data.name,
        slug,
        description: data.description || null,
        seoTitle: data.seoTitle || null,
        seoDescription: data.seoDescription || null,
        canonicalUrl: data.canonicalUrl || null,
        noindex: data.noindex,
        ogImageId: data.ogImageId,
        updatedBy: ctx.user.id,
      };
      if (id) {
        const [before] = await tx
          .select()
          .from(postCategories)
          .where(and(eq(postCategories.id, id), eq(postCategories.agencyId, currentAgencyId())));
        if (!before) throw new ActionError("This category no longer exists.", "NOT_FOUND");
        const [after] = await tx
          .update(postCategories)
          .set(values)
          .where(eq(postCategories.id, id))
          .returning();
        await redirectSlugChange(tx, {
          entity: "postCategory",
          entityId: id,
          oldSlug: before.slug,
          newSlug: slug,
          actorId: ctx.user.id,
        });
        await auditChange(tx, {
          actor: ctx.actor,
          action: "post_category.update",
          entityType: "post_category",
          entityId: id,
          before,
          after: after!,
        });
        await syncMediaUsage(tx, [before.ogImageId, after!.ogImageId]);
        return after!;
      }
      const [{ n } = { n: 0 }] = await tx
        .select({ n: count() })
        .from(postCategories)
        .where(eq(postCategories.agencyId, currentAgencyId()));
      const [created] = await tx
        .insert(postCategories)
        .values({ ...values, sortOrder: n, createdBy: ctx.user.id })
        .returning();
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "post_category.create",
        entityType: "post_category",
        entityId: created!.id,
        after: created!,
      });
      await syncMediaUsage(tx, [created!.ogImageId]);
      return created!;
    });
    revalidatePost(null);
    return { id: saved.id, slug: saved.slug };
  },
);

/** The order of the category tabs on /insights. */
export const reorderCategories = adminAction(
  z.object({ ids: z.array(z.uuid()).min(1).max(200) }),
  { write: true },
  async ({ ids }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries())
        await tx
          .update(postCategories)
          .set({ sortOrder: index })
          .where(and(eq(postCategories.id, id), eq(postCategories.agencyId, currentAgencyId())));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "post_category.reorder",
        entityType: "post_category",
        after: { order: ids },
      });
    });
    revalidatePost(null);
    return { count: ids.length };
  },
);

/** Deleting a category leaves its posts without one (they stay published). */
export const deleteCategory = adminAction(
  z.object({ id: z.uuid() }),
  { write: true },
  async ({ id }, ctx) => {
    const db = await getDb();
    const result = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(postCategories)
        .where(and(eq(postCategories.id, id), eq(postCategories.agencyId, currentAgencyId())));
      if (!before) throw new ActionError("This category no longer exists.", "NOT_FOUND");
      const moved = await tx
        .update(posts)
        .set({ categoryId: null })
        .where(eq(posts.categoryId, id))
        .returning({ id: posts.id });
      await tx.delete(postCategories).where(eq(postCategories.id, id));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "post_category.delete",
        entityType: "post_category",
        entityId: id,
        before: { ...before, posts: moved.map((m) => m.id) },
      });
      await syncMediaUsage(tx, [before.ogImageId]);
      return { posts: moved.length };
    });
    revalidatePost(null);
    return result;
  },
);

/* Tags -------------------------------------------------------------------------------- */

/** Rename a tag; renaming it to another tag's name merges the two. */
export const renameTag = adminAction(
  z.object({ id: z.uuid(), name: tagNameSchema }),
  { write: true },
  async ({ id, name }, ctx) => {
    const db = await getDb();
    const result = await db.transaction(async (tx) => {
      const agency = currentAgencyId();
      const [before] = await tx
        .select()
        .from(postTags)
        .where(and(eq(postTags.id, id), eq(postTags.agencyId, agency)));
      if (!before) throw new ActionError("This tag no longer exists.", "NOT_FOUND");
      const slug = slugify(name, 60);
      const [other] = await tx
        .select()
        .from(postTags)
        .where(
          and(eq(postTags.agencyId, agency), eq(postTags.slug, slug), sql`${postTags.id} <> ${id}`),
        );
      if (other) {
        // Same name as another tag: its posts get that tag, and this one goes.
        const links = await tx
          .select({ postId: postTagLinks.postId })
          .from(postTagLinks)
          .where(eq(postTagLinks.tagId, id));
        if (links.length)
          await tx
            .insert(postTagLinks)
            .values(links.map((l) => ({ postId: l.postId, tagId: other.id })))
            .onConflictDoNothing();
        await tx.delete(postTags).where(eq(postTags.id, id));
        await writeAudit(tx, {
          actor: ctx.actor,
          action: "post_tag.merge",
          entityType: "post_tag",
          entityId: other.id,
          before: { from: before.name, into: other.name, posts: links.length },
        });
        return { id: other.id, merged: true };
      }
      await tx
        .update(postTags)
        .set({ name, slug, updatedBy: ctx.user.id })
        .where(eq(postTags.id, id));
      await auditChange(tx, {
        actor: ctx.actor,
        action: "post_tag.update",
        entityType: "post_tag",
        entityId: id,
        before: { name: before.name, slug: before.slug },
        after: { name, slug },
      });
      return { id, merged: false };
    });
    revalidatePost(null);
    return result;
  },
);

/** Delete tags; posts simply lose them. */
export const deleteTags = adminAction(
  z.object({ ids: z.array(z.uuid()).min(1).max(500) }),
  { write: true },
  async ({ ids }, ctx) => {
    const db = await getDb();
    const removed = await db.transaction(async (tx) => {
      const rows = await tx
        .delete(postTags)
        .where(and(inArray(postTags.id, ids), eq(postTags.agencyId, currentAgencyId())))
        .returning({ id: postTags.id, name: postTags.name });
      for (const r of rows)
        await writeAudit(tx, {
          actor: ctx.actor,
          action: "post_tag.delete",
          entityType: "post_tag",
          entityId: r.id,
          before: { name: r.name },
        });
      return rows.length;
    });
    revalidatePost(null);
    return { count: removed };
  },
);
