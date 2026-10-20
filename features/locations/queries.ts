import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { agents } from "@/db/schema/people";
import { locations, type LocationLevel } from "@/db/schema/master-data";
import { tags } from "@/lib/cache-tags";
import type { GeoPolygon, LngLat } from "@/lib/geo";

export type LocationNode = {
  id: string;
  parentId: string | null;
  level: LocationLevel;
  name: string;
  slug: string;
  isFeatured: boolean;
  sortOrder: number;
  hasCenter: boolean;
  hasBoundary: boolean;
};

/** Whole tree, light columns (admin tree and pickers). */
export async function listLocationNodes(db?: DbOrTx): Promise<LocationNode[]> {
  const conn = db ?? (await getDb());
  return conn
    .select({
      id: locations.id,
      parentId: locations.parentId,
      level: locations.level,
      name: locations.name,
      slug: locations.slug,
      isFeatured: locations.isFeatured,
      sortOrder: locations.sortOrder,
      hasCenter: sql<boolean>`${locations.center} is not null`,
      hasBoundary: sql<boolean>`${locations.geom} is not null`,
    })
    .from(locations)
    .where(eq(locations.agencyId, currentAgencyId()))
    .orderBy(asc(locations.sortOrder), asc(locations.name));
}

export type LocationDetail = typeof locations.$inferSelect;

export async function getLocationForAdmin(id: string, db?: DbOrTx): Promise<LocationDetail | null> {
  const conn = db ?? (await getDb());
  const [row] = await conn
    .select()
    .from(locations)
    .where(and(eq(locations.id, id), eq(locations.agencyId, currentAgencyId())))
    .limit(1);
  return row ?? null;
}

/** What still references a location (safe delete). Listings/projects/guides are added later. */
export async function locationUsage(
  id: string,
  db?: DbOrTx,
): Promise<{ children: number; agents: number; total: number }> {
  const conn = db ?? (await getDb());
  const [c] = await conn
    .select({ n: sql<number>`count(*)::int` })
    .from(locations)
    .where(eq(locations.parentId, id));
  const [a] = await conn
    .select({ n: sql<number>`count(*)::int` })
    .from(agents)
    .where(sql`${id}::uuid = any(${agents.areas})`);
  const children = c?.n ?? 0;
  const agentCount = a?.n ?? 0;
  return { children, agents: agentCount, total: children + agentCount };
}

/** Cached tree for the public site (autocomplete, breadcrumbs, landing pages). */
export async function getLocationTree(): Promise<
  Array<LocationNode & { center: LngLat | null; description: string | null }>
> {
  "use cache";
  cacheLife("max");
  cacheTag(tags.locations);
  const db = await getDb();
  const rows = await db
    .select({
      id: locations.id,
      parentId: locations.parentId,
      level: locations.level,
      name: locations.name,
      slug: locations.slug,
      isFeatured: locations.isFeatured,
      sortOrder: locations.sortOrder,
      center: locations.center,
      description: locations.description,
      hasCenter: isNotNull(locations.center),
      hasBoundary: isNotNull(locations.geom),
    })
    .from(locations)
    .where(eq(locations.agencyId, currentAgencyId()))
    .orderBy(asc(locations.sortOrder), asc(locations.name));
  return rows.map((r) => ({
    ...r,
    hasCenter: Boolean(r.hasCenter),
    hasBoundary: Boolean(r.hasBoundary),
  }));
}

export type { GeoPolygon };
