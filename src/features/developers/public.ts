import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { developers } from "@/db/schema/master-data";
import { projects } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import { loadListingCards, type ListingCardData } from "@/features/listings/cards";
import { getPublicMedia, type PublicMedia } from "@/features/media/queries";
import { listPublicProjects, type ProjectCardData } from "@/features/projects/public";
import { searchableStatuses } from "@/features/properties/status";
import { tags } from "@/lib/cache-tags";

export type DeveloperTile = {
  id: string;
  slug: string;
  name: string;
  logo: PublicMedia | null;
  establishedYear: number | null;
  projects: number;
};

/** /developers: every developer of the agency with how many published projects it has. */
export async function listPublicDevelopers(): Promise<DeveloperTile[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.developers, tags.projects);
  const db = await getDb();
  const rows = await db
    .select({
      id: developers.id,
      slug: developers.slug,
      name: developers.name,
      logoId: developers.logoId,
      establishedYear: developers.establishedYear,
    })
    .from(developers)
    .where(and(eq(developers.agencyId, currentAgencyId()), isNull(developers.deletedAt)))
    .orderBy(asc(developers.sortOrder), asc(developers.name));
  const counts = await db
    .select({ developerId: projects.developerId, n: sql<number>`count(*)::int` })
    .from(projects)
    .where(
      and(
        eq(projects.agencyId, currentAgencyId()),
        eq(projects.isPublished, true),
        isNull(projects.deletedAt),
        isNotNull(projects.developerId),
      ),
    )
    .groupBy(projects.developerId);
  const published = new Map(counts.map((c) => [c.developerId, c.n]));
  const tiles: DeveloperTile[] = [];
  for (const r of rows)
    tiles.push({
      id: r.id,
      slug: r.slug,
      name: r.name,
      logo: await getPublicMedia(r.logoId),
      establishedYear: r.establishedYear,
      projects: published.get(r.id) ?? 0,
    });
  return tiles;
}

export type PublicDeveloper = {
  id: string;
  slug: string;
  name: string;
  logo: PublicMedia | null;
  description: string | null;
  website: string | null;
  establishedYear: number | null;
  projects: ProjectCardData[];
  listings: ListingCardData[];
  seo: {
    title: string | null;
    description: string | null;
    canonicalUrl: string | null;
    noindex: boolean;
    ogImageId: string | null;
  };
};

/** /developers/[slug]: the developer, its published projects and live listings in them. */
export async function getPublicDeveloper(slug: string): Promise<PublicDeveloper | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.developers);
  const db = await getDb();
  const [d] = await db
    .select()
    .from(developers)
    .where(
      and(
        eq(developers.agencyId, currentAgencyId()),
        eq(developers.slug, slug),
        isNull(developers.deletedAt),
      ),
    )
    .limit(1);
  if (!d) return null;
  cacheTag(tags.developer(d.id), tags.projects, tags.listings);
  const projectCards = await listPublicProjects({
    area: null,
    developer: d.slug,
    status: null,
    handover: null,
  });
  const listingRows = projectCards.length
    ? await db
        .select({ id: properties.id })
        .from(properties)
        .where(
          and(
            inArray(
              properties.projectId,
              projectCards.map((p) => p.id),
            ),
            isNull(properties.deletedAt),
            isNotNull(properties.publishedAt),
            inArray(properties.status, [...searchableStatuses]),
          ),
        )
        .orderBy(desc(properties.isFeatured), sql`${properties.publishedAt} desc nulls last`)
        .limit(12)
    : [];
  return {
    id: d.id,
    slug: d.slug,
    name: d.name,
    logo: await getPublicMedia(d.logoId),
    description: d.description,
    website: d.website,
    establishedYear: d.establishedYear,
    projects: projectCards,
    listings: await loadListingCards(
      db,
      listingRows.map((r) => r.id),
    ),
    seo: {
      title: d.seoTitle,
      description: d.seoDescription,
      canonicalUrl: d.canonicalUrl,
      noindex: d.noindex,
      ogImageId: d.ogImageId,
    },
  };
}
