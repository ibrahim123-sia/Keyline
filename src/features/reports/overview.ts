import "server-only";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { loadSettings } from "@/features/settings/queries";
import { dealValueInBase } from "@/features/utm/report";
import { reports as t } from "@/lib/i18n/dictionaries/reports";
import { agency, num, within } from "./context";
import { formatChange } from "./format";
import { compare, eachDay, rate, type DateRange } from "./period";
import type { Kpi, ReportChart, ReportContext, ReportData, ReportTable } from "./types";

/** The numbers of one period (09 §7 Overview). */
export type PeriodMetrics = {
  leads: number;
  viewings: number;
  won: number;
  /** Minor units of the base currency. */
  dealValue: number;
  /** Seconds; null when no lead of the period was answered. */
  avgResponseSeconds: number | null;
  /** Share of the period's new leads that are won so far (0..1). */
  conversion: number;
};

export async function periodMetrics(
  db: DbOrTx,
  range: DateRange,
  timeZone: string,
): Promise<PeriodMetrics> {
  const market = await loadSettings("market", db);
  const deal = dealValueInBase(market, "w");
  const res = await db.execute<{
    leads: number;
    cohort_won: number;
    avg_response: string | null;
    viewings: number;
    won: number;
    deal_value: string | null;
  }>(sql`
    with cohort as (
      select l.status, l.response_seconds from leads l
      where l.agency_id = ${agency()} and l.merged_into_id is null
        and ${within(sql`l.created_at`, range, timeZone)}
    ), won as (
      select ${deal} as deal from leads w
      where w.agency_id = ${agency()} and w.merged_into_id is null and w.status = 'won'
        and w.won_at is not null and ${within(sql`w.won_at`, range, timeZone)}
    )
    select
      (select count(*) from cohort)::int as leads,
      (select count(*) from cohort where status = 'won')::int as cohort_won,
      (select avg(response_seconds) from cohort) as avg_response,
      (select count(*) from viewings v
        where v.agency_id = ${agency()} and v.status <> 'cancelled'
          and ${within(sql`v.starts_at`, range, timeZone)})::int as viewings,
      (select count(*) from won)::int as won,
      (select sum(deal) from won) as deal_value`);
  const r = res.rows[0]!;
  const leads = num(r.leads);
  return {
    leads,
    viewings: num(r.viewings),
    won: num(r.won),
    dealValue: Math.round(num(r.deal_value)),
    avgResponseSeconds: r.avg_response === null ? null : Math.round(num(r.avg_response)),
    conversion: rate(num(r.cohort_won), leads),
  };
}

/** Open leads still waiting for a first reply, right now (the leads list "Unanswered" view). */
export async function unansweredNow(db: DbOrTx): Promise<number> {
  const res = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from leads
    where agency_id = ${agency()} and merged_into_id is null
      and status = 'open' and first_response_at is null`);
  return num(res.rows[0]?.n);
}

/** New leads and deals won per local day of the range (missing days are zero). */
export async function dailyTrend(
  db: DbOrTx,
  range: DateRange,
  timeZone: string,
): Promise<Array<{ day: string; leads: number; won: number }>> {
  const res = await db.execute<{ day: string; leads: number; won: number }>(sql`
    select day::text as day, sum(leads)::int as leads, sum(won)::int as won from (
      select (l.created_at at time zone ${timeZone})::date as day, 1 as leads, 0 as won
      from leads l
      where l.agency_id = ${agency()} and l.merged_into_id is null
        and ${within(sql`l.created_at`, range, timeZone)}
      union all
      select (w.won_at at time zone ${timeZone})::date, 0, 1
      from leads w
      where w.agency_id = ${agency()} and w.merged_into_id is null and w.status = 'won'
        and w.won_at is not null and ${within(sql`w.won_at`, range, timeZone)}
    ) x group by day`);
  const byDay = new Map(res.rows.map((r) => [r.day, r]));
  return eachDay(range).map((day) => ({
    day,
    leads: num(byDay.get(day)?.leads),
    won: num(byDay.get(day)?.won),
  }));
}

/** Days up to three months stay daily; longer periods add up into weeks from the first day. */
export function bucketTrend(days: Array<{ day: string; leads: number; won: number }>): {
  unit: "day" | "week";
  points: Array<{ x: string; leads: number; won: number }>;
} {
  if (days.length <= 92)
    return { unit: "day", points: days.map((d) => ({ x: d.day, leads: d.leads, won: d.won })) };
  const points: Array<{ x: string; leads: number; won: number }> = [];
  for (let i = 0; i < days.length; i += 7) {
    const week = days.slice(i, i + 7);
    points.push({
      x: week[0]!.day,
      leads: week.reduce((s, d) => s + d.leads, 0),
      won: week.reduce((s, d) => s + d.won, 0),
    });
  }
  return { unit: "week", points };
}

const kpiHref = {
  leads: "/admin/reports/sources",
  viewings: "/admin/reports/funnel",
  won: "/admin/reports/agents",
  dealValue: "/admin/reports/agents",
  avgResponse: "/admin/reports/response-time",
  conversion: "/admin/reports/funnel",
} as const;

/** The dashboard and Overview tiles: this period against the previous one. */
export async function overviewKpis(db: DbOrTx, ctx: ReportContext): Promise<Kpi[]> {
  const cur = await periodMetrics(db, ctx.period, ctx.timeZone);
  const prev = await periodMetrics(db, ctx.period.previous, ctx.timeZone);
  const unanswered = await unansweredNow(db);
  const tile = (
    key: keyof typeof kpiHref,
    label: string,
    format: Kpi["format"],
    value: number | null,
    previous: number | null,
    higherIsBetter = true,
  ): Kpi => ({
    key,
    label,
    format,
    value,
    previous,
    change: value !== null && previous !== null ? compare(value, previous) : null,
    higherIsBetter,
    href: kpiHref[key],
  });
  return [
    tile("leads", t.kpis.leads, "int", cur.leads, prev.leads),
    tile("viewings", t.kpis.viewings, "int", cur.viewings, prev.viewings),
    tile("won", t.kpis.won, "int", cur.won, prev.won),
    tile("dealValue", t.kpis.dealValue, "money", cur.dealValue, prev.dealValue),
    tile(
      "avgResponse",
      t.kpis.avgResponse,
      "duration",
      cur.avgResponseSeconds,
      prev.avgResponseSeconds,
      false,
    ),
    tile("conversion", t.kpis.conversion, "percent", cur.conversion, prev.conversion),
    {
      key: "unanswered",
      label: t.kpis.unanswered,
      format: "int",
      value: unanswered,
      previous: null,
      change: null,
      higherIsBetter: false,
      hint: t.kpis.unansweredHint,
      href: "/admin/leads?unanswered=1",
    },
  ];
}

export async function overviewReport(db: DbOrTx, ctx: ReportContext): Promise<ReportData> {
  const kpis = await overviewKpis(db, ctx);
  const trend = bucketTrend(await dailyTrend(db, ctx.period, ctx.timeZone));
  const chart: ReportChart = {
    id: "trend",
    title: t.overview.trend,
    kind: trend.unit === "day" && trend.points.length <= 31 ? "bar" : "line",
    data: trend.points.map((p) => ({ x: p.x, leads: p.leads, won: p.won })),
    series: [
      { key: "leads", label: t.overview.seriesLeads },
      { key: "won", label: t.overview.seriesWon },
    ],
    format: "int",
  };
  const trendTable: ReportTable = {
    id: "trend",
    title: t.overview.byDay,
    columns: [
      { key: "x", label: trend.unit === "day" ? t.overview.day : t.overview.week, format: "text" },
      { key: "leads", label: t.overview.seriesLeads, format: "int" },
      { key: "won", label: t.overview.seriesWon, format: "int" },
    ],
    rows: trend.points.map((p) => ({ key: p.x, cells: { x: p.x, leads: p.leads, won: p.won } })),
    empty: "",
  };
  return {
    key: "overview",
    title: t.nav.overview,
    period: ctx.period,
    kpis,
    charts: [chart],
    tables: [kpiValuesTable(kpis, ctx.currency), trendTable],
    notes: t.overview.notes,
  };
}

/** Key numbers as a table with this period, the previous one and the change (CSV and PDF). */
export function kpiValuesTable(kpis: Kpi[], currency: ReportContext["currency"]): ReportTable {
  return {
    id: "kpis",
    title: t.overview.kpiTable,
    columns: [
      { key: "metric", label: t.table.metric, format: "text" },
      { key: "current", label: t.table.thisPeriod, format: "int" },
      { key: "previous", label: t.table.previousPeriod, format: "int" },
      { key: "change", label: t.table.change, format: "text" },
    ],
    rows: kpis.map((k) => ({
      key: k.key,
      cells: {
        metric: k.label,
        current: k.value,
        previous: k.previous,
        change: k.change ? formatChange(k.change, k.format, currency) : t.kpis.noComparison,
      },
      // Each metric keeps its own unit.
      formats: { current: k.format, previous: k.format },
    })),
    empty: "",
  };
}
