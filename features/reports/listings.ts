import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db/client";
import { searchableStatuses, statusLabels } from "@/features/properties/status";
import { format } from "@/lib/i18n";
import { reports as t } from "@/lib/i18n/dictionaries/reports";
import { agency, num, numOrNull } from "./context";
import { addDays, rate } from "./period";
import type { ReportContext, ReportData, ReportRow, ReportTable } from "./types";
import type { PropertyStatus } from "@/db/schema/properties";

/**
 * Listings (09 §7): views, saves and inquiries per live listing for the period (from the
 * daily listing counters, kept per local day), days on market, price reductions, and stale
 * listings: not verified in X days, or no inquiries in Y days. X and Y come from the URL
 * (the report's controls), with defaults that match the property list's filters.
 */
export const listingsParamsSchema = z.object({
  verified: z.coerce.number().int().min(1).max(3650).catch(60),
  quiet: z.coerce.number().int().min(1).max(365).catch(30),
});
export type ListingsParams = z.output<typeof listingsParamsSchema>;

export function parseListingsParams(sp: Record<string, string | string[] | undefined>) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return listingsParamsSchema.parse({ verified: one(sp.verified), quiet: one(sp.quiet) });
}

/** On screen the table shows the most viewed listings; exports carry all of them. */
export const LISTINGS_ON_SCREEN = 100;

export type ListingStat = {
  id: string;
  reference: string;
  title: string;
  status: PropertyStatus;
  views: number;
  saves: number;
  inquiries: number;
  daysOnMarket: number | null;
  priceReductions: number;
  verifiedDaysAgo: number | null;
  recentInquiries: number;
  notVerified: boolean;
  noInquiries: boolean;
};

export async function listingStats(
  db: DbOrTx,
  ctx: ReportContext,
  params: ListingsParams,
): Promise<ListingStat[]> {
  const statuses = sql.join(
    searchableStatuses.map((s) => sql`${s}`),
    sql`, `,
  );
  const today = sql`${ctx.today}::date`;
  const quietSince = addDays(ctx.today, -(params.quiet - 1));
  const res = await db.execute<Record<string, unknown>>(sql`
    with live as (
      select p.id, p.reference, p.title, p.status, p.published_at, p.last_verified_at
      from properties p
      where p.agency_id = ${agency()} and p.deleted_at is null and p.status in (${statuses})
    ), period_stats as (
      select s.property_id, sum(s.views) as views, sum(s.saves) as saves,
        sum(s.inquiries) as inquiries
      from property_daily_stats s join live on live.id = s.property_id
      where s.date >= ${ctx.period.from}::date and s.date <= ${ctx.period.to}::date
      group by s.property_id
    ), recent as (
      select s.property_id, sum(s.inquiries) as inquiries
      from property_daily_stats s join live on live.id = s.property_id
      where s.date >= ${quietSince}::date and s.date <= ${today}
      group by s.property_id
    ), cuts as (
      select h.property_id, count(*) as n
      from price_history h join live on live.id = h.property_id
      where h.new_price < h.old_price
      group by h.property_id
    )
    select live.id, live.reference, live.title, live.status,
      coalesce(ps.views, 0)::int as views,
      coalesce(ps.saves, 0)::int as saves,
      coalesce(ps.inquiries, 0)::int as inquiries,
      (${today} - (live.published_at at time zone ${ctx.timeZone})::date) as days_on_market,
      coalesce(cuts.n, 0)::int as price_reductions,
      (${today} - (live.last_verified_at at time zone ${ctx.timeZone})::date) as verified_days_ago,
      coalesce(recent.inquiries, 0)::int as recent_inquiries
    from live
    left join period_stats ps on ps.property_id = live.id
    left join recent on recent.property_id = live.id
    left join cuts on cuts.property_id = live.id
    order by views desc, inquiries desc, live.reference`);
  return res.rows.map((r) => {
    const daysOnMarket = numOrNull(r.days_on_market);
    const verifiedDaysAgo = numOrNull(r.verified_days_ago);
    const recentInquiries = num(r.recent_inquiries);
    return {
      id: String(r.id),
      reference: String(r.reference),
      title: String(r.title),
      status: r.status as PropertyStatus,
      views: num(r.views),
      saves: num(r.saves),
      inquiries: num(r.inquiries),
      daysOnMarket,
      priceReductions: num(r.price_reductions),
      verifiedDaysAgo,
      recentInquiries,
      notVerified: verifiedDaysAgo === null || verifiedDaysAgo >= params.verified,
      // A listing live for less than Y days has not had the chance yet.
      noInquiries: recentInquiries === 0 && daysOnMarket !== null && daysOnMarket >= params.quiet,
    };
  });
}

export function staleReasons(l: ListingStat, params: ListingsParams): string[] {
  const reasons: string[] = [];
  if (l.notVerified)
    reasons.push(
      l.verifiedDaysAgo === null
        ? t.listings.neverVerified
        : format(t.listings.notVerified, { days: params.verified }),
    );
  if (l.noInquiries) reasons.push(format(t.listings.noInquiries, { days: params.quiet }));
  return reasons;
}

export async function listingsReport(
  db: DbOrTx,
  ctx: ReportContext,
  params: ListingsParams,
  options: { full?: boolean } = {},
): Promise<ReportData> {
  const all = await listingStats(db, ctx, params);
  const c = t.listings.columns;
  const views = all.reduce((s, l) => s + l.views, 0);
  const inquiries = all.reduce((s, l) => s + l.inquiries, 0);
  const stale = all.filter((l) => l.notVerified || l.noInquiries);
  const row = (l: ListingStat): ReportRow => ({
    key: l.id,
    href: `/admin/properties/${l.id}`,
    cells: {
      listing: l.title,
      reference: l.reference,
      status: statusLabels[l.status],
      views: l.views,
      saves: l.saves,
      inquiries: l.inquiries,
      inquiryRate: l.views > 0 ? rate(l.inquiries, l.views) : null,
      daysOnMarket: l.daysOnMarket,
      priceReductions: l.priceReductions,
    },
  });
  const shown = options.full ? all : all.slice(0, LISTINGS_ON_SCREEN);
  const table: ReportTable = {
    id: "listings",
    title: t.listings.table,
    description:
      !options.full && all.length > LISTINGS_ON_SCREEN
        ? format(t.listings.topNote, { count: LISTINGS_ON_SCREEN })
        : undefined,
    columns: [
      { key: "listing", label: c.listing, format: "text" },
      { key: "reference", label: c.reference, format: "text" },
      { key: "status", label: c.status, format: "text" },
      { key: "views", label: c.views, format: "int" },
      { key: "saves", label: c.saves, format: "int" },
      { key: "inquiries", label: c.inquiries, format: "int" },
      { key: "inquiryRate", label: c.inquiryRate, format: "percent" },
      { key: "daysOnMarket", label: c.daysOnMarket, format: "int" },
      { key: "priceReductions", label: c.priceReductions, format: "int" },
    ],
    rows: shown.map(row),
    empty: t.listings.empty,
  };
  const staleTable: ReportTable = {
    id: "stale",
    title: t.listings.stale,
    columns: [
      { key: "listing", label: c.listing, format: "text" },
      { key: "reference", label: c.reference, format: "text" },
      { key: "lastVerified", label: c.lastVerified, format: "text" },
      {
        key: "recent",
        label: format(c.recentInquiries, { days: params.quiet }),
        format: "int",
      },
      { key: "reasons", label: c.reasons, format: "text" },
    ],
    rows: stale.map((l) => ({
      key: l.id,
      href: `/admin/properties/${l.id}`,
      cells: {
        listing: l.title,
        reference: l.reference,
        lastVerified:
          l.verifiedDaysAgo === null
            ? t.listings.never
            : format(t.listings.daysAgo, { days: l.verifiedDaysAgo }),
        recent: l.recentInquiries,
        reasons: staleReasons(l, params).join("; "),
      },
    })),
    empty: t.listings.staleEmpty,
  };
  const k = t.listings.kpis;
  const kpi = (key: string, label: string, fmt: "int" | "percent", value: number) => ({
    key,
    label,
    format: fmt,
    value,
    previous: null,
    change: null,
    higherIsBetter: key !== "stale",
  });
  return {
    key: "listings",
    title: t.nav.listings,
    period: ctx.period,
    kpis: [
      kpi("live", k.live, "int", all.length),
      kpi("views", k.views, "int", views),
      kpi("inquiries", k.inquiries, "int", inquiries),
      kpi("inquiryRate", k.inquiryRate, "percent", rate(inquiries, views)),
      kpi("stale", k.stale, "int", stale.length),
    ],
    charts: all.some((l) => l.views > 0)
      ? [
          {
            id: "top",
            title: t.listings.chart,
            kind: "hbar",
            data: all.slice(0, 10).map((l) => ({ x: l.reference, views: l.views })),
            series: [{ key: "views", label: c.views }],
            format: "int",
          },
        ]
      : [],
    tables: [table, staleTable],
    notes: t.listings.notes,
  };
}
