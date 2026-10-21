import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { areaGuides, faqs, posts, type ContentStatus } from "@/db/schema/content";
import { locations } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { mediaUrl } from "@/features/media/queries";
import { guideMediaIds, loadGuide } from "./load";
import type { GuideInput } from "./schema";

export type GuideListRow = {
  id: string;
  title: string;
  slug: string;
  status: ContentStatus;
  publishAt: string | null;
  locationName: string;
  questions: number;
  coverUrl: string | null;
  updatedAt: string;
};

/** Admin -> Website -> Area guides: every guide with its area and status. */
export async function listGuidesAdmin(db: DbOrTx): Promise<GuideListRow[]> {
  const rows = await db
    .select({
      id: areaGuides.id,
      title: areaGuides.title,
      slug: areaGuides.slug,
      status: areaGuides.status,
      publishAt: areaGuides.publishAt,
      updatedAt: areaGuides.updatedAt,
      locationName: locations.name,
      coverKey: media.r2Key,
    })
    .from(areaGuides)
    .innerJoin(locations, eq(locations.id, areaGuides.locationId))
    .leftJoin(media, and(eq(media.id, areaGuides.coverId), eq(media.status, "ready")))
    .where(and(eq(areaGuides.agencyId, currentAgencyId()), isNull(areaGuides.deletedAt)))
    .orderBy(asc(locations.name));
  const counts = rows.length
    ? await db
        .select({ id: faqs.areaGuideId, n: sql<number>`count(*)::int` })
        .from(faqs)
        .where(
          inArray(
            faqs.areaGuideId,
            rows.map((r) => r.id),
          ),
        )
        .groupBy(faqs.areaGuideId)
    : [];
  const byGuide = new Map(counts.map((c) => [c.id, c.n]));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    status: r.status,
    publishAt: r.publishAt?.toISOString() ?? null,
    locationName: r.locationName,
    questions: byGuide.get(r.id) ?? 0,
    coverUrl: r.coverKey ? mediaUrl(r.coverKey) : null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export type GuideLocationNode = {
  id: string;
  parentId: string | null;
  name: string;
  level: string;
  hasGuide: boolean;
};

export async function guideLocationNodes(db: DbOrTx): Promise<GuideLocationNode[]> {
  const rows = await db
    .select({
      id: locations.id,
      parentId: locations.parentId,
      name: locations.name,
      level: locations.level,
      guideId: areaGuides.id,
    })
    .from(locations)
    .leftJoin(areaGuides, eq(areaGuides.locationId, locations.id))
    .where(eq(locations.agencyId, currentAgencyId()))
    .orderBy(asc(locations.sortOrder), asc(locations.name));
  return rows.map(({ guideId, ...r }) => ({ ...r, hasGuide: guideId !== null }));
}

export type GuideEditorData = {
  id: string;
  input: GuideInput;
  status: ContentStatus;
  publishAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  /** Thumbnails of the photos (id -> address; null while a file is still processing). */
  photoUrls: Record<string, string | null>;
  options: {
    locations: GuideLocationNode[];
    posts: Array<{ id: string; title: string; status: ContentStatus }>;
  };
};

export async function loadGuideEditorData(db: DbOrTx, id: string): Promise<GuideEditorData | null> {
  const loaded = await loadGuide(db, id);
  if (!loaded) return null;
  const { row, input } = loaded;
  const ids = guideMediaIds(input);
  const files = ids.length
    ? await db
        .select({ id: media.id, r2Key: media.r2Key, status: media.status })
        .from(media)
        .where(inArray(media.id, ids))
    : [];
  const postRows = await db
    .select({ id: posts.id, title: posts.title, status: posts.status })
    .from(posts)
    .where(and(eq(posts.agencyId, currentAgencyId()), isNull(posts.deletedAt)))
    .orderBy(desc(posts.publishedAt), asc(posts.title))
    .limit(300);
  return {
    id: row.id,
    input,
    status: row.status,
    publishAt: row.publishAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    photoUrls: Object.fromEntries(
      files.map((f) => [f.id, f.status === "ready" ? mediaUrl(f.r2Key) : null]),
    ),
    options: { locations: await guideLocationNodes(db), posts: postRows },
  };
}
