import "server-only";
import { sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { tags } from "@/lib/cache-tags";

/** One autocomplete row (06 §4.3). */
export type Suggestion = {
  kind: "location" | "building" | "project" | "developer" | "listing";
  label: string;
  /** Parent area or developer, for context ("Dubai Marina · Dubai"). */
  detail: string | null;
  /** Locations and projects: the `loc` filter value. */
  value: string | null;
  /** Developers and listings: where choosing it goes. */
  href: string | null;
};

export const SUGGEST_MIN = 2;

/** Lower-case, accents removed, spaces squeezed (the cache key and the SQL input). */
export function normalizeQuery(q: string): string {
  return q
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/**
 * Typo-tolerant suggestions (pg_trgm word similarity on accent-free names, 06 §4.3): areas
 * and buildings, published projects, developers and live listing references, best first.
 * Cached per normalized query, so common prefixes answer from the cache.
 */
export async function suggest(normalized: string): Promise<Suggestion[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.locations, tags.projects, tags.developers, tags.listings);
  const q = normalizeQuery(normalized);
  if (q.length < SUGGEST_MIN) return [];
  const db = await getDb();
  const agency = currentAgencyId();
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const prefix = `${q.replace(/[\\%_]/g, "\\$&")}%`;
  // A name matches when it contains the text, or one of its words is close to it
  // (word_similarity: "marena" finds "Dubai Marina"). Prefix matches rank first.

  const locations = await db.execute<{
    slug: string;
    name: string;
    level: string;
    parent: string | null;
    rank: number;
  }>(sql`
    select l.slug, l.name, l.level, p.name as parent,
      (case when lintel_normalize(l.name) like ${prefix} then 2
            when lintel_normalize(l.name) like ${like} then 1 else 0 end)
        + word_similarity(${q}, lintel_normalize(l.name)) as rank
    from locations l
    left join locations p on p.id = l.parent_id
    where l.agency_id = ${agency}
      and (lintel_normalize(l.name) like ${like} or word_similarity(${q}, lintel_normalize(l.name)) >= 0.35)
    -- Areas before buildings, as the list groups them.
    order by (l.level = 'building'), rank desc, length(l.name), l.name
    limit 8`);

  const projectRows = await db.execute<{
    slug: string;
    name: string;
    developer: string | null;
    rank: number;
  }>(sql`
    select pr.slug, pr.name, d.name as developer,
      (case when lintel_normalize(pr.name) like ${prefix} then 2
            when lintel_normalize(pr.name) like ${like} then 1 else 0 end)
        + word_similarity(${q}, lintel_normalize(pr.name)) as rank
    from projects pr
    left join developers d on d.id = pr.developer_id
    where pr.agency_id = ${agency} and pr.is_published and pr.deleted_at is null
      and (lintel_normalize(pr.name) like ${like} or word_similarity(${q}, lintel_normalize(pr.name)) >= 0.35)
    order by rank desc, pr.name
    limit 5`);

  const developerRows = await db.execute<{ slug: string; name: string; rank: number }>(sql`
    select d.slug, d.name,
      (case when lintel_normalize(d.name) like ${prefix} then 2
            when lintel_normalize(d.name) like ${like} then 1 else 0 end)
        + word_similarity(${q}, lintel_normalize(d.name)) as rank
    from developers d
    where d.agency_id = ${agency} and d.deleted_at is null
      and (lintel_normalize(d.name) like ${like} or word_similarity(${q}, lintel_normalize(d.name)) >= 0.35)
    order by rank desc, d.name
    limit 4`);

  // References only from a recognisable start ("hd-10", "HD1042").
  const refQuery = q.replace(/\s+/g, "");
  const listingRows = /\d/.test(refQuery)
    ? await db.execute<{ reference: string; slug: string; title: string }>(sql`
        select reference, slug, title from properties
        where agency_id = ${agency} and deleted_at is null and published_at is not null
          and status in ('available', 'reserved', 'under_offer', 'sold', 'rented')
          and replace(lower(reference), '-', '') like ${`${refQuery.replace(/-/g, "").replace(/[\\%_]/g, "\\$&")}%`}
        order by reference
        limit 5`)
    : { rows: [] };

  return [
    ...locations.rows.map((r) => ({
      kind: r.level === "building" ? ("building" as const) : ("location" as const),
      label: r.name,
      detail: r.parent,
      value: r.slug,
      href: null,
    })),
    ...projectRows.rows.map((r) => ({
      kind: "project" as const,
      label: r.name,
      detail: r.developer,
      value: `p.${r.slug}`,
      href: null,
    })),
    ...developerRows.rows.map((r) => ({
      kind: "developer" as const,
      label: r.name,
      detail: null,
      value: null,
      href: `/developers/${r.slug}`,
    })),
    ...listingRows.rows.map((r) => ({
      kind: "listing" as const,
      label: r.reference,
      detail: r.title,
      value: null,
      href: `/property/${r.slug}`,
    })),
  ];
}
