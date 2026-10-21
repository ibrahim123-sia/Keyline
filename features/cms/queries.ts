import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { pages } from "@/db/schema/cms";
import { locations, propertyTypes } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { properties, propertyMedia } from "@/db/schema/properties";
import { loadListingCards, type ListingCardData } from "@/features/listings/cards";
import { mediaUrl } from "@/features/media/queries";
import { searchableStatuses } from "@/features/properties/status";
import { parseSearch } from "@/features/search/params";
import { searchListings } from "@/features/search/query";
import { tags } from "@/lib/cache-tags";
import { parseSection, type Section } from "./sections";

export type PublicPage = {
  id: string;
  title: string;
  sections: Section[];
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageId: string | null;
  noindex: boolean;
};

/** The published home page (08 §1 "set as home"), or null before one is published. */
export async function getHomePage(): Promise<PublicPage | null> {
  "use cache";
  cacheLife("max");
  cacheTag(tags.homePage, tags.pages);
  const db = await getDb();
  const [row] = await db
    .select()
    .from(pages)
    .where(
      and(
        eq(pages.agencyId, currentAgencyId()),
        eq(pages.isHome, true),
        eq(pages.status, "published"),
        isNull(pages.deletedAt),
      ),
    );
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    sections: row.sections.map(parseSection).filter((s): s is Section => s !== null),
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    ogImageId: row.ogImageId,
    noindex: row.noindex,
  };
}

const live = () =>
  and(
    eq(properties.agencyId, currentAgencyId()),
    isNull(properties.deletedAt),
    isNotNull(properties.publishedAt),
    inArray(properties.status, [...searchableStatuses]),
  );

/** Cards for a "Featured listings" section (08 §1 source: manual, featured, newest, filter). */
export async function featuredListingCards(props: {
  source: "featured" | "newest" | "manual" | "filter";
  listingIds: string[];
  filter: string;
  count: number;
}): Promise<ListingCardData[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.listings, tags.search);
  const db = await getDb();
  if (props.source === "filter") {
    const result = await searchListings(parseSearch(new URLSearchParams(props.filter)));
    return result.cards.slice(0, props.count);
  }
  if (props.source === "manual") {
    if (props.listingIds.length === 0) return [];
    const rows = await db
      .select({ id: properties.id })
      .from(properties)
      .where(and(live(), inArray(properties.id, props.listingIds)));
    const allowed = new Set(rows.map((r) => r.id));
    return loadListingCards(
      db,
      props.listingIds.filter((id) => allowed.has(id)).slice(0, props.count),
    );
  }
  const rows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(props.source === "featured" ? and(live(), eq(properties.isFeatured, true)) : live())
    .orderBy(desc(properties.publishedAt), desc(properties.id))
    .limit(props.count);
  return loadListingCards(
    db,
    rows.map((r) => r.id),
  );
}

export type AreaCardData = {
  id: string;
  slug: string;
  name: string;
  forSale: number;
  forRent: number;
  cover: { url: string; alt: string; color: string | null } | null;
};

/** Areas with live listing counts (including what is inside them) and a photo from one. */
export async function areaCards(props: {
  source: "featured" | "manual";
  locationIds: string[];
  count: number;
}): Promise<AreaCardData[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.locations, tags.listings);
  const db = await getDb();
  const where = [eq(locations.agencyId, currentAgencyId())];
  if (props.source === "manual" && props.locationIds.length)
    where.push(inArray(locations.id, props.locationIds));
  else where.push(eq(locations.isFeatured, true));
  const rows = await db
    .select({ id: locations.id, slug: locations.slug, name: locations.name })
    .from(locations)
    .where(and(...where))
    .orderBy(asc(locations.sortOrder), asc(locations.name))
    .limit(props.count);
  const out: AreaCardData[] = [];
  for (const loc of rows) {
    const within = sql`${properties.locationId} in (with recursive sub as (select id from locations where id = ${loc.id}::uuid union all select l.id from locations l join sub on l.parent_id = sub.id) select id from sub)`;
    const [counts] = await db
      .select({
        sale: sql<number>`count(*) filter (where ${properties.purpose} = 'sale')::int`,
        rent: sql<number>`count(*) filter (where ${properties.purpose} = 'rent')::int`,
      })
      .from(properties)
      .where(and(live(), within));
    const [cover] = await db
      .select({ key: media.r2Key, alt: media.alt, color: media.dominantColor })
      .from(propertyMedia)
      .innerJoin(properties, eq(properties.id, propertyMedia.propertyId))
      .innerJoin(media, eq(media.id, propertyMedia.mediaId))
      .where(
        and(
          live(),
          within,
          eq(propertyMedia.kind, "photo"),
          eq(propertyMedia.isCover, true),
          eq(media.status, "ready"),
        ),
      )
      .orderBy(desc(properties.isFeatured), desc(properties.publishedAt))
      .limit(1);
    out.push({
      ...loc,
      forSale: counts?.sale ?? 0,
      forRent: counts?.rent ?? 0,
      cover: cover ? { url: mediaUrl(cover.key), alt: cover.alt ?? "", color: cover.color } : null,
    });
  }
  return out;
}

/** What the hero search card offers: property types and budget steps from real prices. */
export async function heroSearchOptions(): Promise<{
  types: Array<{ slug: string; name: string }>;
  budgets: { sale: number[]; rent: number[] };
}> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.listings, tags.masterData("property-types"));
  const db = await getDb();
  const types = await db
    .select({ slug: propertyTypes.slug, name: propertyTypes.name })
    .from(propertyTypes)
    .where(eq(propertyTypes.agencyId, currentAgencyId()))
    .orderBy(asc(propertyTypes.sortOrder), asc(propertyTypes.name));
  const steps = async (purpose: "sale" | "rent") => {
    const res = await db.execute<{ q: string | null }>(sql`
      select percentile_disc(array[0.2, 0.4, 0.6, 0.8, 0.95]) within group (order by price) as q
      from properties
      where agency_id = ${currentAgencyId()} and deleted_at is null and published_at is not null
        and purpose = ${purpose} and price is not null and price_on_request = false
        and status in ('available', 'reserved', 'under_offer')`);
    const raw = res.rows[0]?.q as unknown;
    const values = Array.isArray(raw) ? (raw as Array<number | string>).map(Number) : [];
    // Two significant figures in major units of the base currency: "1,500,000", not "1,512,345".
    return [...new Set(values.filter((v) => v > 0).map(roundNice))];
  };
  return { types, budgets: { sale: await steps("sale"), rent: await steps("rent") } };
}

/** Minor units -> a round number of major units (two significant figures), still in minor units. */
function roundNice(minor: number): number {
  if (minor <= 0) return minor;
  const digits = Math.floor(Math.log10(minor)) + 1;
  const step = 10 ** Math.max(0, digits - 2);
  return Math.ceil(minor / step) * step;
}
