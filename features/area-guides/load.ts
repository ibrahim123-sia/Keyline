import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { areaGuideMedia, areaGuides, faqs } from "@/db/schema/content";
import { tags } from "@/lib/cache-tags";
import { postReferences } from "@/lib/rich-text-post";
import { uniqueSlug } from "@/lib/slug";
import type { GuideInput } from "./schema";

export type GuideRow = typeof areaGuides.$inferSelect;

/** A guide as the editor edits it (with its photos and its own questions), or null. */
export async function loadGuide(
  db: DbOrTx,
  id: string,
): Promise<{ row: GuideRow; input: GuideInput } | null> {
  const [row] = await db
    .select()
    .from(areaGuides)
    .where(
      and(
        eq(areaGuides.id, id),
        eq(areaGuides.agencyId, currentAgencyId()),
        isNull(areaGuides.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  const photos = await db
    .select({
      mediaId: areaGuideMedia.mediaId,
      caption: areaGuideMedia.caption,
      alt: areaGuideMedia.alt,
    })
    .from(areaGuideMedia)
    .where(eq(areaGuideMedia.guideId, id))
    .orderBy(asc(areaGuideMedia.sortOrder));
  const questions = await db
    .select({
      id: faqs.id,
      question: faqs.question,
      answer: faqs.answer,
      isPublished: faqs.isPublished,
    })
    .from(faqs)
    .where(eq(faqs.areaGuideId, id))
    .orderBy(asc(faqs.sortOrder));
  return {
    row,
    input: {
      title: row.title,
      locationId: row.locationId,
      intro: row.intro,
      body: row.body,
      coverId: row.coverId,
      gallery: photos,
      highlights: row.highlights,
      stats: row.stats,
      faqs: questions,
      relatedPostIds: row.relatedPostIds,
      slug: row.slug,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      canonicalUrl: row.canonicalUrl,
      noindex: row.noindex,
      ogImageId: row.ogImageId,
    },
  };
}

/** Library files a guide uses: cover, share image, photos and images in the text. */
export function guideMediaIds(
  g: Pick<GuideInput, "coverId" | "ogImageId" | "gallery" | "body">,
): string[] {
  return [
    g.coverId,
    g.ogImageId,
    ...g.gallery.map((p) => p.mediaId),
    ...postReferences(g.body).mediaIds,
  ].filter((x): x is string => !!x);
}

export async function guideSlug(db: DbOrTx, base: string, exceptId: string | null) {
  return uniqueSlug(base, async (candidates) => {
    const rows = await db
      .select({ slug: areaGuides.slug })
      .from(areaGuides)
      .where(
        and(
          eq(areaGuides.agencyId, currentAgencyId()),
          inArray(areaGuides.slug, candidates),
          exceptId ? sql`${areaGuides.id} <> ${exceptId}` : sql`true`,
        ),
      );
    return new Set(rows.map((r) => r.slug));
  });
}

/** Expires what shows a guide: its page, /areas, the area's search pages, FAQs, sitemap. */
export function revalidateGuide(id: string): void {
  updateTag(tags.areaGuide(id));
  updateTag(tags.areaGuides);
  updateTag(tags.faqs);
  updateTag(tags.sitemap);
}
