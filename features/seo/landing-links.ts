import "server-only";
import { sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { searchableStatuses } from "@/features/properties/status";
import { loadSettings } from "@/features/settings/queries";
import { tags } from "@/lib/cache-tags";
import { landingIndexable } from "./landing";

export type TypeLink = { slug: string; name: string; count: number };

/**
 * The area x type landings an area page links to (08 §6 internal linking): only types with
 * enough listings to count as generated pages, most listings first.
 */
export async function typeLandingLinks(
  locationSlug: string,
  purpose: "sale" | "rent",
): Promise<TypeLink[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.search, tags.listings, tags.locations, tags.settings("seo"));
  const db = await getDb();
  const agency = currentAgencyId();
  const seo = await loadSettings("seo", db);
  const res = await db.execute<{ slug: string; name: string; n: number }>(sql`
    with recursive sub as (
      select id from locations where agency_id = ${agency} and slug = ${locationSlug}
      union all
      select l.id from locations l join sub on l.parent_id = sub.id
    )
    select pt.slug, pt.name, count(*)::int as n
    from properties p join property_types pt on pt.id = p.property_type_id
    where p.agency_id = ${agency} and p.deleted_at is null and p.published_at is not null
      and p.status in ${[...searchableStatuses]} and p.purpose = ${purpose}
      and p.location_id in (select id from sub)
    group by pt.slug, pt.name
    order by n desc, pt.name`);
  return res.rows
    .map((r) => ({ slug: r.slug, name: r.name, count: Number(r.n) }))
    .filter((r) => landingIndexable("type", r.count, seo));
}
