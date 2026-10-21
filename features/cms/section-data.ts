import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { faqs, postCategories, posts, testimonials } from "@/db/schema/content";
import { pois } from "@/db/schema/master-data";
import { properties } from "@/db/schema/properties";
import { listPublicAgents, type AgentTile } from "@/features/agents/public";
import { listPublicDevelopers, type DeveloperTile } from "@/features/developers/public";
import type { ListingCardData } from "@/features/listings/cards";
import { getPublicMedia, type PublicMedia } from "@/features/media/queries";
import { liveStatuses } from "@/features/properties/status";
import { parseSearch, searchHref, type SearchFilters } from "@/features/search/params";
import { searchListings, searchPins, type SearchPin } from "@/features/search/query";
import { tags } from "@/lib/cache-tags";
import { renderRichText, richTextToPlain } from "@/lib/rich-text";
import type { SectionPropsOf } from "./sections";

/** What the newer section types show (08 §1), read from the agency's own records. */

const byIds = <T extends { id: string }>(rows: T[], ids: string[]) => {
  const map = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => (map.has(id) ? [map.get(id)!] : []));
};

export type TestimonialCard = {
  id: string;
  name: string;
  roleText: string | null;
  quote: string;
  rating: number | null;
  photo: PublicMedia | null;
  property: { title: string; slug: string } | null;
};

export async function testimonialCards(
  props: Pick<SectionPropsOf<"testimonials">, "source" | "testimonialIds" | "count">,
): Promise<TestimonialCard[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.testimonials, tags.listings);
  const db = await getDb();
  const where = and(
    eq(testimonials.agencyId, currentAgencyId()),
    eq(testimonials.isPublished, true),
  );
  const manual = props.source === "manual";
  if (manual && props.testimonialIds.length === 0) return [];
  const rows = await db
    .select({
      id: testimonials.id,
      name: testimonials.name,
      roleText: testimonials.roleText,
      quote: testimonials.quote,
      rating: testimonials.rating,
      photoId: testimonials.photoId,
      propertyTitle: properties.title,
      propertySlug: properties.slug,
      propertyStatus: properties.status,
      propertyDeleted: properties.deletedAt,
    })
    .from(testimonials)
    .leftJoin(properties, eq(properties.id, testimonials.propertyId))
    .where(manual ? and(where, inArray(testimonials.id, props.testimonialIds)) : where)
    .orderBy(asc(testimonials.sortOrder), desc(testimonials.createdAt))
    .limit(manual ? 12 : props.count);
  const ordered = manual ? byIds(rows, props.testimonialIds) : rows;
  const out: TestimonialCard[] = [];
  for (const r of ordered)
    out.push({
      id: r.id,
      name: r.name,
      roleText: r.roleText,
      quote: r.quote,
      rating: r.rating,
      photo: await getPublicMedia(r.photoId),
      // Only a listing that is still on the site is linked.
      property:
        r.propertySlug &&
        !r.propertyDeleted &&
        (liveStatuses as readonly string[]).includes(r.propertyStatus ?? "")
          ? { title: r.propertyTitle!, slug: r.propertySlug }
          : null,
    });
  return out;
}

export type FaqItem = { id: string; question: string; answerHtml: string; answerText: string };

export async function faqItems(
  props: Pick<SectionPropsOf<"faq">, "source" | "group" | "faqIds" | "count">,
): Promise<FaqItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.faqs);
  const db = await getDb();
  const where = and(eq(faqs.agencyId, currentAgencyId()), eq(faqs.isPublished, true));
  const manual = props.source === "manual";
  if (manual && props.faqIds.length === 0) return [];
  const rows = await db
    .select({ id: faqs.id, question: faqs.question, answer: faqs.answer })
    .from(faqs)
    .where(
      manual
        ? and(where, inArray(faqs.id, props.faqIds))
        : and(where, eq(faqs.group, props.group), isNull(faqs.areaGuideId)),
    )
    .orderBy(asc(faqs.sortOrder), asc(faqs.createdAt))
    .limit(manual ? 30 : props.count);
  return (manual ? byIds(rows, props.faqIds) : rows).map((r) => ({
    id: r.id,
    question: r.question,
    // Rendered here from the stored document, by our own allowlist renderer.
    answerHtml: renderRichText(r.answer),
    answerText: richTextToPlain(r.answer),
  }));
}

export async function teamTiles(
  props: Pick<SectionPropsOf<"team">, "source" | "agentIds" | "count">,
): Promise<AgentTile[]> {
  const all = await listPublicAgents();
  return props.source === "manual" ? byIds(all, props.agentIds) : all.slice(0, props.count);
}

export async function developerLogos(
  props: Pick<SectionPropsOf<"developer_logos">, "source" | "developerIds" | "count">,
): Promise<DeveloperTile[]> {
  const all = await listPublicDevelopers();
  return props.source === "manual"
    ? byIds(all, props.developerIds)
    : all.filter((d) => d.logo).slice(0, props.count);
}

export type PostCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  readingMinutes: number;
  category: string | null;
  cover: PublicMedia | null;
};

export async function postCards(
  props: Pick<SectionPropsOf<"blog_posts">, "source" | "categoryId" | "count">,
): Promise<PostCard[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.posts);
  if (props.source === "category" && !props.categoryId) return [];
  const db = await getDb();
  const rows = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      publishedAt: posts.publishedAt,
      readingMinutes: posts.readingMinutes,
      category: postCategories.name,
      coverId: posts.coverId,
    })
    .from(posts)
    .leftJoin(postCategories, eq(postCategories.id, posts.categoryId))
    .where(
      and(
        eq(posts.agencyId, currentAgencyId()),
        eq(posts.status, "published"),
        isNull(posts.deletedAt),
        props.source === "category" && props.categoryId
          ? eq(posts.categoryId, props.categoryId)
          : sql`true`,
      ),
    )
    .orderBy(desc(posts.publishedAt), desc(posts.id))
    .limit(props.count);
  const out: PostCard[] = [];
  for (const r of rows)
    out.push({
      id: r.id,
      slug: r.slug,
      title: r.title,
      excerpt: r.excerpt,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      readingMinutes: r.readingMinutes,
      category: r.category,
      cover: await getPublicMedia(r.coverId),
    });
  return out;
}

/**
 * Filters from a search link the admin pasted (08 §1 "saved filter set"): "/buy/marina/villas
 * ?max=5000000", "/rent?beds=2", "/off-plan", a full address or just the query.
 */
export function filtersFromSearchLink(link: string): SearchFilters {
  let path = "";
  let query = link.trim();
  try {
    const url = new URL(link.trim(), "https://site.invalid");
    path = url.pathname;
    query = url.search;
  } catch {
    /* keep it as a query */
  }
  if (!link.trim().startsWith("/") && !/^https?:/i.test(link.trim())) {
    path = "";
    query = link.trim().replace(/^\?/, "");
  }
  const [root, loc, type] = path.split("/").filter(Boolean);
  const preset: Parameters<typeof parseSearch>[1] = {};
  if (root === "rent") preset.purpose = "rent";
  else if (root === "buy") preset.purpose = "sale";
  else if (root === "off-plan") Object.assign(preset, { purpose: "sale", completion: "off_plan" });
  if ((root === "buy" || root === "rent") && loc) preset.loc = [loc];
  if ((root === "buy" || root === "rent") && loc && type) preset.type = [type];
  return parseSearch(new URLSearchParams(query), preset);
}

export async function searchEmbedCards(
  props: Pick<SectionPropsOf<"search_embed">, "search" | "count">,
): Promise<{ cards: ListingCardData[]; total: number; href: string }> {
  const filters = { ...filtersFromSearchLink(props.search), page: 1 };
  const result = await searchListings(filters);
  return {
    cards: result.cards.slice(0, props.count),
    total: result.total,
    href: searchHref(filters),
  };
}

export type MapPlace = { id: string; name: string; lng: number; lat: number };

/** Listing pins (public points only) and nearby places for the map section. */
export async function mapSectionData(props: {
  showListings: boolean;
  showPois: boolean;
}): Promise<{ listings: SearchPin[]; places: MapPlace[] }> {
  const listings = props.showListings ? (await searchPins(parseSearch({}))).slice(0, 500) : [];
  const places = props.showPois ? await mapPlaces() : [];
  return { listings, places };
}

async function mapPlaces(): Promise<MapPlace[]> {
  "use cache";
  cacheLife("days");
  cacheTag(tags.masterData("pois"));
  const db = await getDb();
  return db
    .select({
      id: pois.id,
      name: pois.name,
      lng: sql<number>`ST_X(${pois.point})`,
      lat: sql<number>`ST_Y(${pois.point})`,
    })
    .from(pois)
    .where(and(eq(pois.agencyId, currentAgencyId()), eq(pois.isActive, true)))
    .limit(300);
}
