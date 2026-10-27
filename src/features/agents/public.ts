import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { locations } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { properties } from "@/db/schema/properties";
import { loadListingCards, type ListingCardData } from "@/features/listings/cards";
import { getPublicMedia, type PublicMedia } from "@/features/media/queries";
import { searchableStatuses } from "@/features/properties/status";
import { tags } from "@/lib/cache-tags";

export type AgentTile = {
  id: string;
  slug: string;
  name: string;
  title: string | null;
  photo: PublicMedia | null;
  languages: string[];
  areas: Array<{ name: string; slug: string }>;
};

async function areaNames(ids: string[]): Promise<Map<string, { name: string; slug: string }>> {
  if (ids.length === 0) return new Map();
  const db = await getDb();
  const rows = await db
    .select({ id: locations.id, name: locations.name, slug: locations.slug })
    .from(locations)
    .where(and(inArray(locations.id, ids), eq(locations.agencyId, currentAgencyId())))
    .orderBy(asc(locations.name));
  return new Map(rows.map((r) => [r.id, { name: r.name, slug: r.slug }]));
}

/** /agents (06 §8): active agent profiles in the agency's order. */
export async function listPublicAgents(): Promise<AgentTile[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.agents, tags.locations);
  const db = await getDb();
  const rows = await db
    .select()
    .from(agents)
    .where(and(eq(agents.agencyId, currentAgencyId()), eq(agents.isActive, true)))
    .orderBy(asc(agents.sortOrder), asc(agents.name));
  const names = await areaNames([...new Set(rows.flatMap((r) => r.areas))]);
  const tiles: AgentTile[] = [];
  for (const r of rows)
    tiles.push({
      id: r.id,
      slug: r.slug,
      name: r.name,
      title: r.title,
      photo: await getPublicMedia(r.photoId),
      languages: r.languages,
      areas: r.areas.flatMap((id) => (names.has(id) ? [names.get(id)!] : [])),
    });
  return tiles;
}

export type PublicAgent = AgentTile & {
  bio: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  replyTimeText: string | null;
  listings: ListingCardData[];
  seo: {
    title: string | null;
    description: string | null;
    canonicalUrl: string | null;
    noindex: boolean;
    ogImageId: string | null;
  };
};

/** /agents/[slug]: an active agent with their live listings. Turned-off profiles are a 404. */
export async function getPublicAgent(slug: string): Promise<PublicAgent | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.agents);
  const db = await getDb();
  const [a] = await db
    .select()
    .from(agents)
    .where(
      and(eq(agents.agencyId, currentAgencyId()), eq(agents.slug, slug), eq(agents.isActive, true)),
    )
    .limit(1);
  if (!a) return null;
  cacheTag(tags.agent(a.id), tags.listings, tags.locations);
  const names = await areaNames(a.areas);
  const listingRows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.agentId, a.id),
        isNull(properties.deletedAt),
        isNotNull(properties.publishedAt),
        inArray(properties.status, [...searchableStatuses]),
      ),
    )
    .orderBy(desc(properties.isFeatured), sql`${properties.publishedAt} desc nulls last`)
    .limit(24);
  return {
    id: a.id,
    slug: a.slug,
    name: a.name,
    title: a.title,
    photo: await getPublicMedia(a.photoId),
    languages: a.languages,
    areas: a.areas.flatMap((id) => (names.has(id) ? [names.get(id)!] : [])),
    bio: a.bio,
    phone: a.phone,
    whatsapp: a.whatsapp,
    email: a.email,
    replyTimeText: a.replyTimeText,
    listings: await loadListingCards(
      db,
      listingRows.map((r) => r.id),
    ),
    seo: {
      title: a.seoTitle,
      description: a.seoDescription,
      canonicalUrl: a.canonicalUrl,
      noindex: a.noindex,
      ogImageId: a.ogImageId,
    },
  };
}
