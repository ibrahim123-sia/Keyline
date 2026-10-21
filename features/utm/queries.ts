import "server-only";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { utmLinks } from "@/db/schema/crm";
import type { TableParams } from "@/lib/table-params";

export type UtmLinkRow = typeof utmLinks.$inferSelect & {
  /** Leads whose last touch carried this link's source, medium and campaign. */
  leads: number;
};

export const utmLinkSortable = ["name", "clicks", "created"] as const;
type Sortable = (typeof utmLinkSortable)[number];

export async function listUtmLinks(
  params: TableParams<Sortable>,
  db: DbOrTx,
): Promise<{ rows: UtmLinkRow[]; total: number }> {
  const leadsCount = sql<number>`(
    select count(*)::int from leads l
    where l.agency_id = ${utmLinks.agencyId} and l.merged_into_id is null
      and l.last_touch->>'utm_source' = ${utmLinks.utmSource}
      and l.last_touch->>'utm_medium' = ${utmLinks.utmMedium}
      and l.last_touch->>'utm_campaign' = ${utmLinks.utmCampaign})`;
  const like = `%${params.q.replace(/[%_\\]/g, "\\$&")}%`;
  const where = and(
    eq(utmLinks.agencyId, currentAgencyId()),
    params.q
      ? or(
          ilike(utmLinks.name, like),
          ilike(utmLinks.utmCampaign, like),
          ilike(utmLinks.utmSource, like),
          ilike(utmLinks.shortCode, like),
        )
      : undefined,
  );
  const column = {
    name: utmLinks.name,
    clicks: utmLinks.clicks,
    created: utmLinks.createdAt,
  }[params.sort.id];
  const rows = await db
    .select({ link: utmLinks, leads: leadsCount })
    .from(utmLinks)
    .where(where)
    .orderBy(params.sort.desc ? desc(column) : asc(column), desc(utmLinks.createdAt))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(utmLinks)
    .where(where);
  return { rows: rows.map((r) => ({ ...r.link, leads: r.leads })), total: count?.n ?? 0 };
}
