import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cacheLife, cacheTag } from "next/cache";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { areaGuideMedia, areaGuides, faqs, type GuideStat } from "@/db/schema/content";
import { locations, poiTypes, pois } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { properties } from "@/db/schema/properties";
import { publicPostCards, type PostCardData } from "@/features/blog/public";
import { bodyMedia } from "@/features/content/body";
import { loadListingCards, type ListingCardData } from "@/features/listings/cards";
import { getPublicMedia, mediaUrl, type PublicMedia } from "@/features/media/queries";
import { listPublicProjects, type ProjectCardData } from "@/features/projects/public";
import { locationAndBelow } from "@/features/properties/queries";
import { searchableStatuses } from "@/features/properties/status";
import { loadSettings } from "@/features/settings/queries";
import { siteOrigin } from "@/features/site/url";
import { tags } from "@/lib/cache-tags";
import type { LngLat } from "@/lib/geo";
import { postReferences, renderPostSegments, type PostSegment } from "@/lib/rich-text-post";

/** Area guides on the site (06 §7): /areas, /areas/[slug] and the area's search pages. */

const isPublic = (): SQL =>
  and(
    eq(areaGuides.agencyId, currentAgencyId()),
    eq(areaGuides.status, "published"),
    isNull(areaGuides.deletedAt),
  )!;

/** Listings on the site in this area or anywhere inside it. */
const liveIn = (locationId: string): SQL =>
  and(
    eq(properties.agencyId, currentAgencyId()),
    isNull(properties.deletedAt),
    isNotNull(properties.publishedAt),
    inArray(properties.status, [...searchableStatuses]),
    sql`${properties.locationId} in ${locationAndBelow(locationId)}`,
  )!;

export type LiveCounts = { sale: number; rent: number };

export async function liveCounts(db: DbOrTx, locationId: string): Promise<LiveCounts> {
  const rows = await db
    .select({ purpose: properties.purpose, n: sql<number>`count(*)::int` })
    .from(properties)
    .where(liveIn(locationId))
    .groupBy(properties.purpose);
  const n = (p: string) => rows.find((r) => r.purpose === p)?.n ?? 0;
  return { sale: n("sale"), rent: n("rent") };
}

export type GuideCardData = {
  id: string;
  slug: string;
  title: string;
  intro: string | null;
  cover: PublicMedia | null;
  locationName: string;
  counts: LiveCounts;
};

/** /areas: every published guide with the homes on the site in its area. */
export async function listPublicGuides(): Promise<GuideCardData[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.areaGuides, tags.listings, tags.locations);
  const db = await getDb();
  const rows = await db
    .select({
      id: areaGuides.id,
      slug: areaGuides.slug,
      title: areaGuides.title,
      intro: areaGuides.intro,
      coverId: areaGuides.coverId,
      locationId: areaGuides.locationId,
      locationName: locations.name,
    })
    .from(areaGuides)
    .innerJoin(locations, eq(locations.id, areaGuides.locationId))
    .where(isPublic())
    .orderBy(asc(locations.sortOrder), asc(locations.name));
  const cards: GuideCardData[] = [];
  for (const r of rows)
    cards.push({
      id: r.id,
      slug: r.slug,
      title: r.title,
      intro: r.intro,
      cover: await getPublicMedia(r.coverId),
      locationName: r.locationName,
      counts: await liveCounts(db, r.locationId),
    });
  return cards;
}

export type GuideFaq = { id: string; question: string; answerHtml: string };

/** A published guide's own published questions, in order. */
async function guideFaqs(db: DbOrTx, guideId: string): Promise<GuideFaq[]> {
  return db
    .select({ id: faqs.id, question: faqs.question, answerHtml: faqs.answerHtml })
    .from(faqs)
    .where(and(eq(faqs.areaGuideId, guideId), eq(faqs.isPublished, true)))
    .orderBy(asc(faqs.sortOrder));
}

export type LandingGuide = { slug: string; title: string; intro: string | null; faqs: GuideFaq[] };

/** The published guide of an area, for its SEO landing pages (intro and FAQs, 08 §6). */
export async function guideForLocation(locationId: string): Promise<LandingGuide | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.areaGuides, tags.faqs);
  const db = await getDb();
  const [g] = await db
    .select({
      id: areaGuides.id,
      slug: areaGuides.slug,
      title: areaGuides.title,
      intro: areaGuides.intro,
    })
    .from(areaGuides)
    .where(and(isPublic(), eq(areaGuides.locationId, locationId)))
    .limit(1);
  if (!g) return null;
  return { slug: g.slug, title: g.title, intro: g.intro, faqs: await guideFaqs(db, g.id) };
}

export type GuidePlace = { id: string; name: string; point: LngLat; typeName: string };

export type PublicGuide = {
  id: string;
  slug: string;
  title: string;
  intro: string | null;
  cover: PublicMedia | null;
  location: {
    id: string;
    name: string;
    slug: string;
    parentName: string | null;
    center: LngLat | null;
  };
  segments: PostSegment[];
  highlights: string[];
  stats: GuideStat[];
  gallery: Array<PublicMedia & { caption: string | null }>;
  faqs: GuideFaq[];
  related: PostCardData[];
  counts: LiveCounts;
  /** Average asking price per m² of the homes for sale (base currency); null under 3 homes. */
  average: { perSqm: number; currency: string; listings: number } | null;
  forSale: ListingCardData[];
  toRent: ListingCardData[];
  projects: ProjectCardData[];
  places: GuidePlace[];
  publishedAt: string | null;
  updatedAt: string;
  seo: {
    title: string | null;
    description: string | null;
    canonicalUrl: string | null;
    noindex: boolean;
    ogImageId: string | null;
  };
};

const parent = alias(locations, "parent");

/** /areas/[slug]: the guide with its live counts, homes, projects, places and questions. */
export async function getPublicGuide(slug: string): Promise<PublicGuide | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.areaGuides);
  const db = await getDb();
  const [row] = await db
    .select({
      guide: areaGuides,
      locationName: locations.name,
      locationSlug: locations.slug,
      center: locations.center,
      hasShape: sql<boolean>`${locations.geom} is not null`,
      parentName: parent.name,
    })
    .from(areaGuides)
    .innerJoin(locations, eq(locations.id, areaGuides.locationId))
    .leftJoin(parent, eq(parent.id, locations.parentId))
    .where(and(isPublic(), eq(areaGuides.slug, slug)))
    .limit(1);
  if (!row) return null;
  const g = row.guide;
  cacheTag(
    tags.areaGuide(g.id),
    tags.listings,
    tags.locations,
    tags.projects,
    tags.posts,
    tags.faqs,
    tags.masterData("poi-types"),
  );

  const { mediaIds } = postReferences(g.body);
  const photoRows = await db
    .select({
      id: media.id,
      r2Key: media.r2Key,
      width: media.width,
      height: media.height,
      libraryAlt: media.alt,
      color: media.dominantColor,
      alt: areaGuideMedia.alt,
      caption: areaGuideMedia.caption,
    })
    .from(areaGuideMedia)
    .innerJoin(media, eq(media.id, areaGuideMedia.mediaId))
    .where(and(eq(areaGuideMedia.guideId, g.id), eq(media.status, "ready")))
    .orderBy(asc(areaGuideMedia.sortOrder));
  for (const id of [...mediaIds, ...photoRows.map((p) => p.id)]) cacheTag(tags.media(id));

  const market = await loadSettings("market", db);
  const [avg] = await db
    .select({
      perSqm: sql<number | null>`avg(${properties.price}::float8 / ${properties.size}::float8)`,
      n: sql<number>`count(*)::int`,
    })
    .from(properties)
    .where(
      and(
        liveIn(g.locationId),
        eq(properties.purpose, "sale"),
        eq(properties.currency, market.baseCurrency.code),
        eq(properties.priceOnRequest, false),
        sql`${properties.price} > 0 and ${properties.size} > 0`,
      ),
    );

  const homeIds = async (purpose: "sale" | "rent") =>
    (
      await db
        .select({ id: properties.id })
        .from(properties)
        .where(and(liveIn(g.locationId), eq(properties.purpose, purpose)))
        .orderBy(desc(properties.isFeatured), sql`${properties.publishedAt} desc nulls last`)
        .limit(6)
    ).map((r) => r.id);

  const places = await db
    .select({ id: pois.id, name: pois.name, point: pois.point, typeName: poiTypes.name })
    .from(pois)
    .innerJoin(poiTypes, eq(poiTypes.id, pois.poiTypeId))
    .where(
      and(
        eq(pois.agencyId, currentAgencyId()),
        eq(pois.isActive, true),
        row.hasShape
          ? sql`ST_Intersects(${pois.point}, (select geom from locations where id = ${g.locationId}::uuid))`
          : row.center
            ? sql`ST_DWithin(${pois.point}::geography, (select center from locations where id = ${g.locationId}::uuid)::geography, 2500)`
            : sql`false`,
      ),
    )
    .orderBy(asc(poiTypes.sortOrder), asc(pois.name))
    .limit(60);

  return {
    id: g.id,
    slug: g.slug,
    title: g.title,
    intro: g.intro,
    cover: await getPublicMedia(g.coverId),
    location: {
      id: g.locationId,
      name: row.locationName,
      slug: row.locationSlug,
      parentName: row.parentName,
      center: row.center,
    },
    segments: renderPostSegments(g.body, {
      media: await bodyMedia(db, mediaIds),
      siteOrigin: siteOrigin(),
    }),
    highlights: g.highlights,
    stats: g.stats,
    gallery: photoRows.map((p) => ({
      id: p.id,
      url: mediaUrl(p.r2Key),
      width: p.width,
      height: p.height,
      alt: p.alt || p.libraryAlt || "",
      dominantColor: p.color,
      caption: p.caption,
    })),
    faqs: await guideFaqs(db, g.id),
    related: await publicPostCards(g.relatedPostIds),
    counts: await liveCounts(db, g.locationId),
    average:
      avg && avg.perSqm != null && avg.n >= 3
        ? { perSqm: Math.round(avg.perSqm), currency: market.baseCurrency.code, listings: avg.n }
        : null,
    forSale: await loadListingCards(db, await homeIds("sale")),
    toRent: await loadListingCards(db, await homeIds("rent")),
    projects: await listPublicProjects({
      area: row.locationSlug,
      developer: null,
      status: null,
      handover: null,
    }),
    places: places.map((p) => ({ id: p.id, name: p.name, point: p.point, typeName: p.typeName })),
    publishedAt: g.publishedAt?.toISOString() ?? null,
    updatedAt: g.updatedAt.toISOString(),
    seo: {
      title: g.seoTitle,
      description: g.seoDescription,
      canonicalUrl: g.canonicalUrl,
      noindex: g.noindex,
      ogImageId: g.ogImageId,
    },
  };
}
