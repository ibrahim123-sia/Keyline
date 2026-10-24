import type { PriceStatSource } from "@/db/schema/stats";

/** Price trend series for the chart (11 §7). Pure and client-safe. */

/** Fewer points than this: "Not enough data yet". */
export const MIN_CHART_POINTS = 5;
/** Months shown, counted back from the latest figure. */
export const CHART_MONTHS = 24;

export type StatPoint = {
  /** "2026-09-01" */
  period: string;
  source: PriceStatSource;
  /** Minor units per m²; rents per year. */
  value: number;
  listingsCount: number;
  avgDaysOnMarket: number | null;
  sourceNote: string | null;
};

export type Series = { source: PriceStatSource; points: StatPoint[]; notes: string[] };

export type TrendSummary = {
  series: Series[];
  /** The series the numbers below come from (agency data first). */
  primary: Series | null;
  latest: StatPoint | null;
  /** Share, e.g. 0.052 for +5.2%; null without a figure 12 months before the latest. */
  change12m: number | null;
  listingsCount: number | null;
  avgDaysOnMarket: number | null;
};

const monthIndex = (period: string) => {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return y * 12 + (m - 1);
};

/** Months between two periods ("2025-09-01" to "2026-09-01" is 12). */
export const monthsBetween = (a: string, b: string) => monthIndex(b) - monthIndex(a);

/**
 * Groups figures by source (one point per month each), keeps the last CHART_MONTHS months
 * before the latest figure, and shows them when the chart has at least MIN_CHART_POINTS
 * figures in all (a line needs 2). The headline numbers come from the agency's own data when
 * it has MIN_CHART_POINTS figures, else from the longest series.
 */
export function summarise(points: readonly StatPoint[]): TrendSummary {
  const latestPeriod = points.reduce<string | null>(
    (max, p) => (!max || p.period > max ? p.period : max),
    null,
  );
  const recent = latestPeriod
    ? points.filter((p) => monthsBetween(p.period, latestPeriod) < CHART_MONTHS)
    : [];
  let series: Series[] = [];
  for (const source of ["agency_data", "admin_entered"] as const) {
    const byMonth = new Map<string, StatPoint>();
    for (const p of recent) if (p.source === source) byMonth.set(p.period, p);
    const list = [...byMonth.values()].sort((a, b) => a.period.localeCompare(b.period));
    if (list.length >= 2)
      series.push({
        source,
        points: list,
        notes: [...new Set(list.map((p) => p.sourceNote).filter((n): n is string => Boolean(n)))],
      });
  }
  if (series.reduce((n, x) => n + x.points.length, 0) < MIN_CHART_POINTS) series = [];
  const primary =
    series.find((x) => x.source === "agency_data" && x.points.length >= MIN_CHART_POINTS) ??
    [...series].sort((a, b) => b.points.length - a.points.length)[0] ??
    null;
  const latest = primary?.points.at(-1) ?? null;
  const yearBefore =
    latest && primary
      ? (primary.points.find((p) => monthsBetween(p.period, latest.period) === 12) ?? null)
      : null;
  const agency = series.find((s) => s.source === "agency_data");
  const lastAgency = agency?.points.at(-1) ?? null;
  return {
    series,
    primary,
    latest,
    change12m:
      latest && yearBefore && yearBefore.value > 0
        ? (latest.value - yearBefore.value) / yearBefore.value
        : null,
    listingsCount: lastAgency ? lastAgency.listingsCount : (latest?.listingsCount ?? null),
    avgDaysOnMarket:
      agency?.points
        .slice()
        .reverse()
        .find((p) => p.avgDaysOnMarket != null)?.avgDaysOnMarket ?? null,
  };
}
