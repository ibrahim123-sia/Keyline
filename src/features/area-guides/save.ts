import "server-only";
import { and, eq, inArray, isNull, ne, notInArray, or } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { areaGuideMedia, areaGuides, faqs, posts } from "@/db/schema/content";
import { locations } from "@/db/schema/master-data";
import { prepareBody } from "@/features/content/body";
import { checkImages, fieldError } from "@/features/content/checks";
import { assertLiveRules, publishingValues } from "@/features/content/publishing";
import type { Publishing } from "@/features/content/schema";
import { syncMediaUsage } from "@/features/media/usage";
import { redirectSlugChange } from "@/features/seo/redirects";
import { ActionError } from "@/lib/actions";
import { auditChange, writeAudit, type AuditActor } from "@/lib/audit";
import { renderRichText } from "@/lib/rich-text";
import { slugify } from "@/lib/slug";
import { guideMediaIds, guideSlug, loadGuide } from "./load";
import { guidePublishProblems, type GuideInput } from "./schema";

/** The area exists, has no other guide, and the posts are this agency's. */
async function checkReferences(db: DbOrTx, guideId: string, data: GuideInput): Promise<void> {
  const agency = currentAgencyId();
  const [loc] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, data.locationId), eq(locations.agencyId, agency)));
  if (!loc) fieldError("locationId", "This area no longer exists.");
  const [other] = await db
    .select({ id: areaGuides.id })
    .from(areaGuides)
    .where(
      and(
        eq(areaGuides.agencyId, agency),
        eq(areaGuides.locationId, data.locationId),
        ne(areaGuides.id, guideId),
      ),
    );
  if (other) fieldError("locationId", "This area already has a guide.");
  await checkImages(db, [
    { id: data.coverId, field: "coverId" },
    { id: data.ogImageId, field: "ogImageId" },
    ...data.gallery.map((p, i) => ({ id: p.mediaId, field: `gallery.${i}` })),
  ]);
  if (data.relatedPostIds.length) {
    const found = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(inArray(posts.id, data.relatedPostIds), eq(posts.agencyId, agency)));
    if (found.length !== new Set(data.relatedPostIds).size)
      fieldError("relatedPostIds", "A chosen post was deleted. Remove it and save again.");
  }
  const ids = data.faqs.map((f) => f.id);
  if (new Set(ids).size !== ids.length) fieldError("faqs", "Two questions have the same id.");
  if (ids.length) {
    const elsewhere = await db
      .select({ id: faqs.id })
      .from(faqs)
      .where(
        and(inArray(faqs.id, ids), or(isNull(faqs.areaGuideId), ne(faqs.areaGuideId, guideId))),
      );
    if (elsewhere.length)
      fieldError("faqs", "A question belongs to another list. Reload the page.");
  }
}

/** The guide's own questions: kept ids are updated, new ones added, removed ones deleted. */
async function saveFaqs(
  tx: Tx,
  guideId: string,
  data: GuideInput,
  before: GuideInput,
  userId: string,
) {
  const keep = data.faqs.map((f) => f.id);
  await tx
    .delete(faqs)
    .where(
      keep.length
        ? and(eq(faqs.areaGuideId, guideId), notInArray(faqs.id, keep))
        : eq(faqs.areaGuideId, guideId),
    );
  const existing = new Set(before.faqs.map((f) => f.id));
  for (const [i, f] of data.faqs.entries()) {
    const values = {
      question: f.question,
      answer: f.answer,
      answerHtml: renderRichText(f.answer),
      isPublished: f.isPublished,
      sortOrder: i,
      updatedBy: userId,
    };
    if (existing.has(f.id)) await tx.update(faqs).set(values).where(eq(faqs.id, f.id));
    else
      await tx
        .insert(faqs)
        .values({ id: f.id, areaGuideId: guideId, group: "general", createdBy: userId, ...values });
  }
}

/**
 * Saves the guide editor (08 §4). A published or scheduled guide keeps passing the publish
 * rules; a slug change after it has been public adds a 301 from the old address.
 */
export async function saveGuideRecord(
  tx: Tx,
  args: {
    id: string;
    data: GuideInput;
    expectedUpdatedAt: string;
    actor: AuditActor;
    userId: string;
  },
): Promise<{ updatedAt: string; slug: string }> {
  const loaded = await loadGuide(tx, args.id);
  if (!loaded) throw new ActionError("This area guide no longer exists.", "NOT_FOUND");
  const { row, input: before } = loaded;
  if (row.updatedAt.toISOString() !== args.expectedUpdatedAt)
    throw new ActionError(
      "Someone else saved this guide since you opened it. Reload to see their changes; yours stay on this page until you do.",
      "CONFLICT",
    );
  const data = args.data;
  await checkReferences(tx, row.id, data);
  const body = await prepareBody(tx, data.body);
  assertLiveRules(row.status, "guide", guidePublishProblems(data));

  const followsTitle = row.publishedAt === null && row.slug === slugify(row.title);
  const slugBase = data.slug && !(followsTitle && data.slug === row.slug) ? data.slug : data.title;
  const slug = await guideSlug(tx, slugBase, row.id);

  const [after] = await tx
    .update(areaGuides)
    .set({
      title: data.title,
      locationId: data.locationId,
      intro: data.intro || null,
      body: body.body,
      bodyHtml: body.bodyHtml,
      coverId: data.coverId,
      highlights: data.highlights,
      stats: data.stats,
      relatedPostIds: [...new Set(data.relatedPostIds)],
      slug,
      seoTitle: data.seoTitle || null,
      seoDescription: data.seoDescription || null,
      canonicalUrl: data.canonicalUrl || null,
      noindex: data.noindex,
      ogImageId: data.ogImageId,
      updatedBy: args.userId,
    })
    .where(eq(areaGuides.id, row.id))
    .returning();

  await tx.delete(areaGuideMedia).where(eq(areaGuideMedia.guideId, row.id));
  if (data.gallery.length)
    await tx.insert(areaGuideMedia).values(
      data.gallery.map((p, i) => ({
        guideId: row.id,
        mediaId: p.mediaId,
        sortOrder: i,
        caption: p.caption || null,
        alt: p.alt || null,
      })),
    );
  await saveFaqs(tx, row.id, data, before, args.userId);

  if (row.publishedAt && row.slug !== slug)
    await redirectSlugChange(tx, {
      entity: "areaGuide",
      entityId: row.id,
      oldSlug: row.slug,
      newSlug: slug,
      actorId: args.userId,
    });
  await auditChange(tx, {
    actor: args.actor,
    action: "area_guide.update",
    entityType: "area_guide",
    entityId: row.id,
    before,
    after: { ...data, slug, body: body.body },
  });
  await syncMediaUsage(tx, [...guideMediaIds(before), ...guideMediaIds(data)]);
  return { updatedAt: after!.updatedAt.toISOString(), slug };
}

export async function setGuidePublishingRecord(
  tx: Tx,
  input: Publishing,
  ctx: { actor: AuditActor; userId: string },
  now = new Date(),
): Promise<{ updatedAt: string; status: string; publishAt: string | null }> {
  const loaded = await loadGuide(tx, input.id);
  if (!loaded) throw new ActionError("This area guide no longer exists.", "NOT_FOUND");
  const { row } = loaded;
  const values = {
    ...publishingValues(input, row, guidePublishProblems(loaded.input), now),
    updatedBy: ctx.userId,
  };
  const [after] = await tx
    .update(areaGuides)
    .set(values)
    .where(eq(areaGuides.id, row.id))
    .returning();
  await auditChange(tx, {
    actor: ctx.actor,
    action: `area_guide.${input.action}`,
    entityType: "area_guide",
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

/** Delete: a guide on the site is unpublished first. Its photos and questions go with it. */
export async function deleteGuideRecord(tx: Tx, id: string, ctx: { actor: AuditActor }) {
  const loaded = await loadGuide(tx, id);
  if (!loaded) throw new ActionError("This area guide no longer exists.", "NOT_FOUND");
  if (loaded.row.status === "published")
    throw new ActionError("Unpublish this guide before deleting it.", "PUBLISHED");
  await tx.delete(areaGuides).where(eq(areaGuides.id, id));
  await writeAudit(tx, {
    actor: ctx.actor,
    action: "area_guide.delete",
    entityType: "area_guide",
    entityId: id,
    before: { title: loaded.row.title, slug: loaded.row.slug, faqs: loaded.input.faqs.length },
  });
  await syncMediaUsage(tx, guideMediaIds(loaded.input));
}
