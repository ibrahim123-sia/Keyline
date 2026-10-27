import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db/client";
import type { LeadSource } from "@/db/schema/crm";
import { loadSettings } from "@/features/settings/queries";
import { campaignReport, dealValueInBase, reportDimensions } from "@/features/utm/report";
import { format } from "@/lib/i18n";
import { leads as leadWords } from "@/lib/i18n/dictionaries/leads";
import { reports as t } from "@/lib/i18n/dictionaries/reports";
import { agency, num, within } from "./context";
import { rate } from "./period";
import type { ReportContext, ReportData, ReportRow, ReportTable } from "./types";

/**
 * Sources and campaigns (09 §7): by how the lead got in touch (the lead's `source`), or by the
 * campaign source, medium, campaign or channel of its first or last touch. The campaign
 * dimensions are the Campaigns -> Report query itself (`campaignReport`), not a copy.
 */
export const sourceDimensions = ["leadSource", ...reportDimensions] as const;
export type SourceDimension = (typeof sourceDimensions)[number];

export const sourcesParamsSchema = z.object({
  by: z.enum(sourceDimensions).catch("leadSource"),
  touch: z.enum(["first", "last"]).catch("first"),
});
export type SourcesParams = z.output<typeof sourcesParamsSchema>;

export function parseSourcesParams(sp: Record<string, string | string[] | undefined>) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return sourcesParamsSchema.parse({ by: one(sp.by), touch: one(sp.touch) });
}

type SourceRow = { value: string; leads: number; viewings: number; won: number; dealValue: number };

/** Leads of the period by their `source`, counted like the campaign report. */
export async function leadSourceRows(db: DbOrTx, ctx: ReportContext): Promise<SourceRow[]> {
  const market = await loadSettings("market", db);
  const res = await db.execute<{
    value: string;
    leads: number;
    viewings: number;
    won: number;
    deal_value: string | null;
  }>(sql`
    select l.source as value,
      count(*)::int as leads,
      coalesce(sum((select count(*) from viewings v
        where v.lead_id = l.id and v.status <> 'cancelled')), 0)::int as viewings,
      (count(*) filter (where l.status = 'won'))::int as won,
      sum(${dealValueInBase(market, "l")}) filter (where l.status = 'won') as deal_value
    from leads l
    where l.agency_id = ${agency()} and l.merged_into_id is null
      and ${within(sql`l.created_at`, ctx.period, ctx.timeZone)}
    group by 1
    order by 2 desc, 1`);
  return res.rows.map((r) => ({
    value: r.value,
    leads: num(r.leads),
    viewings: num(r.viewings),
    won: num(r.won),
    dealValue: Math.round(num(r.deal_value)),
  }));
}

function label(dimension: SourceDimension, value: string): string {
  if (dimension === "leadSource") return leadWords.sources[value as LeadSource] ?? value;
  if (dimension === "channel")
    return leadWords.channels[value as keyof typeof leadWords.channels] ?? value;
  return value;
}

export async function sourcesReport(
  db: DbOrTx,
  ctx: ReportContext,
  params: SourcesParams,
): Promise<ReportData> {
  const rows: SourceRow[] =
    params.by === "leadSource"
      ? await leadSourceRows(db, ctx)
      : (
          await campaignReport(db, {
            dimension: params.by,
            touch: params.touch,
            from: ctx.period.from,
            to: ctx.period.to,
          })
        ).rows;
  const toRow = (r: SourceRow): ReportRow => ({
    key: r.value,
    cells: {
      value: label(params.by, r.value),
      leads: r.leads,
      viewings: r.viewings,
      won: r.won,
      conversion: rate(r.won, r.leads),
      dealValue: r.dealValue,
    },
  });
  const sum = (k: keyof Omit<SourceRow, "value">) => rows.reduce((s, r) => s + r[k], 0);
  const c = t.sources.columns;
  const dimensionLabel = t.sources.dimensions[params.by];
  const table: ReportTable = {
    id: "sources",
    title:
      params.by === "leadSource"
        ? dimensionLabel
        : `${dimensionLabel}, ${params.touch === "first" ? t.sources.firstTouch : t.sources.lastTouch}`,
    columns: [
      { key: "value", label: dimensionLabel, format: "text" },
      { key: "leads", label: c.leads, format: "int" },
      { key: "viewings", label: c.viewings, format: "int" },
      { key: "won", label: c.won, format: "int" },
      { key: "conversion", label: c.conversion, format: "percent" },
      { key: "dealValue", label: c.dealValue, format: "money" },
    ],
    rows: rows.map(toRow),
    total:
      rows.length > 0
        ? {
            key: "total",
            cells: {
              value: t.table.total,
              leads: sum("leads"),
              viewings: sum("viewings"),
              won: sum("won"),
              conversion: rate(sum("won"), sum("leads")),
              dealValue: sum("dealValue"),
            },
          }
        : undefined,
    empty: t.sources.empty,
  };
  return {
    key: "sources",
    title: t.nav.sources,
    period: ctx.period,
    kpis: [],
    charts: [
      {
        id: "sources",
        title: format(t.sources.chart, { dimension: dimensionLabel.toLowerCase() }),
        kind: "hbar",
        data: rows.slice(0, 12).map((r) => ({ x: label(params.by, r.value), leads: r.leads })),
        series: [{ key: "leads", label: c.leads }],
        format: "int",
      },
    ],
    tables: [table],
    notes: [...t.sources.notes, t.sources.campaignReport],
  };
}
