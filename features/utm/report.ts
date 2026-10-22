import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { loadSettings } from "@/features/settings/queries";

/**
 * Campaign report (09 §2): leads, viewings, won deals and deal value by source, medium,
 * campaign or channel, from the leads' first or last touch, for a date range in the agency's
 * time zone. Deal values are in the base currency (Settings -> Market rates).
 */
export const reportDimensions = ["source", "medium", "campaign", "channel"] as const;
export type ReportDimension = (typeof reportDimensions)[number];

export const reportParamsSchema = z.object({
  dimension: z.enum(reportDimensions).catch("source"),
  touch: z.enum(["first", "last"]).catch("first"),
  from: z.iso.date().nullable().catch(null),
  to: z.iso.date().nullable().catch(null),
});
export type ReportParams = z.output<typeof reportParamsSchema>;

export type ReportRow = {
  value: string;
  leads: number;
  viewings: number;
  won: number;
  /** Minor units of the base currency. */
  dealValue: number;
};

/** What a lead without this field counts as. */
export const NOT_TRACKED = "(not tracked)";
export const NONE = "(none)";

const keys: Record<ReportDimension, string> = {
  source: "utm_source",
  medium: "utm_medium",
  campaign: "utm_campaign",
  channel: "channel",
};

export async function campaignReport(
  db: DbOrTx,
  params: ReportParams & { from: string; to: string },
): Promise<{ rows: ReportRow[]; total: ReportRow; currency: string }> {
  const [market, general] = [await loadSettings("market", db), await loadSettings("general", db)];
  const base = market.baseCurrency;
  const touch = params.touch === "first" ? sql.raw("l.first_touch") : sql.raw("l.last_touch");
  const key = keys[params.dimension];
  const cases: SQL[] = market.visitorCurrencies
    .filter((c) => c.code !== base.code)
    .map(
      (c) =>
        sql`when ${c.code} then round(l.deal_value::numeric / ${10 ** c.decimals} / ${c.rate} * ${10 ** base.decimals})`,
    );
  const dealInBase = cases.length
    ? sql`(case l.deal_currency ${sql.join(cases, sql` `)} else l.deal_value::numeric end)`
    : sql`l.deal_value::numeric`;
  const res = await db.execute<{
    value: string;
    leads: number;
    viewings: number;
    won: number;
    deal_value: string | null;
  }>(sql`
    select
      case when ${touch} is null then ${NOT_TRACKED}
           else coalesce(nullif(${touch}->>${key}, ''), ${NONE}) end as value,
      count(*)::int as leads,
      coalesce(sum((select count(*) from viewings v
        where v.lead_id = l.id and v.status <> 'cancelled')), 0)::int as viewings,
      (count(*) filter (where l.status = 'won'))::int as won,
      sum(${dealInBase}) filter (where l.status = 'won') as deal_value
    from leads l
    where l.agency_id = ${currentAgencyId()} and l.merged_into_id is null
      and (l.created_at at time zone ${general.timeZone})::date >= ${params.from}::date
      and (l.created_at at time zone ${general.timeZone})::date <= ${params.to}::date
    group by 1
    order by 2 desc, 1`);
  const rows: ReportRow[] = res.rows.map((r) => ({
    value: r.value,
    leads: Number(r.leads),
    viewings: Number(r.viewings),
    won: Number(r.won),
    dealValue: Math.round(Number(r.deal_value ?? 0)),
  }));
  const total = rows.reduce(
    (t, r) => ({
      value: "Total",
      leads: t.leads + r.leads,
      viewings: t.viewings + r.viewings,
      won: t.won + r.won,
      dealValue: t.dealValue + r.dealValue,
    }),
    { value: "Total", leads: 0, viewings: 0, won: 0, dealValue: 0 },
  );
  return { rows, total, currency: base.code };
}

/** The default range: the last 90 days up to today, in the agency's time zone. */
export function defaultRange(today: string): { from: string; to: string } {
  const [y, m, d] = today.split("-").map(Number);
  const from = new Date(Date.UTC(y!, m! - 1, d! - 89)).toISOString().slice(0, 10);
  return { from, to: today };
}
