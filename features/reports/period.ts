import { z } from "zod";
import { wallTimeToIso } from "@/lib/zoned-time";

/**
 * Report periods (09 §7 "by period with comparison"): a preset or custom dates, always whole
 * days in the agency's time zone, compared with the period just before it. Pure date maths on
 * "YYYY-MM-DD" strings, so it runs the same on the server, in tests and in emails.
 */
export const periodPresets = ["7d", "30d", "90d", "month", "lastMonth", "ytd", "custom"] as const;
export type PeriodPreset = (typeof periodPresets)[number];

/** Custom ranges are capped so one request never scans years of data. */
export const MAX_PERIOD_DAYS = 731;

export type DateRange = { from: string; to: string };

export type Period = DateRange & {
  preset: PeriodPreset;
  /** Number of days, both ends included. */
  days: number;
  previous: DateRange;
};

const isoDate = z.iso.date();

export const periodParamsSchema = z.object({
  period: z.enum(periodPresets).catch("30d"),
  from: isoDate.nullable().catch(null),
  to: isoDate.nullable().catch(null),
});
export type PeriodParams = z.output<typeof periodParamsSchema>;

/** Reads the period from search params (unknown or broken values fall back to 30 days). */
export function parsePeriodParams(sp: Record<string, string | string[] | undefined>): PeriodParams {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  return periodParamsSchema.parse({
    period: one(sp.period) ?? undefined,
    from: one(sp.from),
    to: one(sp.to),
  });
}

function toUtc(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** "2026-10-24" + n days. */
export function addDays(day: string, n: number): string {
  return fromUtc(toUtc(day) + n * 86_400_000);
}

/** Days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** The same day of the month `months` earlier, kept inside that month (31 Mar -> 28/29 Feb). */
function shiftMonths(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(Date.UTC(y!, m! - 1 - months, 1));
  const dim = daysInMonth(target.getUTCFullYear(), target.getUTCMonth());
  return fromUtc(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d!, dim)));
}

function rangeOf(from: string, to: string): DateRange & { days: number } {
  return { from, to, days: daysBetween(from, to) + 1 };
}

/** The `days` days just before `from`. */
function before(from: string, days: number): DateRange {
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

/**
 * Turns the URL's period into concrete dates. `today` is the agency's local date.
 * - 7/30/90 days end today; the comparison is the same number of days before.
 * - This month runs from the 1st to today; it compares with the same days of last month.
 * - Last month is the whole previous month, compared with the month before it.
 * - Year to date compares with the same dates a year earlier.
 * - Custom dates (swapped if reversed, capped at today and 731 days) compare with the same
 *   number of days just before.
 */
export function resolvePeriod(params: PeriodParams, today: string): Period {
  const preset = params.period;
  switch (preset) {
    case "7d":
    case "30d":
    case "90d": {
      const days = Number(preset.slice(0, -1));
      const from = addDays(today, -(days - 1));
      return { preset, ...rangeOf(from, today), previous: before(from, days) };
    }
    case "month": {
      const from = `${today.slice(0, 8)}01`;
      const prevFrom = shiftMonths(from, 1);
      const prevTo = shiftMonths(today, 1);
      return { preset, ...rangeOf(from, today), previous: { from: prevFrom, to: prevTo } };
    }
    case "lastMonth": {
      const from = shiftMonths(`${today.slice(0, 8)}01`, 1);
      const to = addDays(`${today.slice(0, 8)}01`, -1);
      const prevFrom = shiftMonths(from, 1);
      return { preset, ...rangeOf(from, to), previous: { from: prevFrom, to: addDays(from, -1) } };
    }
    case "ytd": {
      const from = `${today.slice(0, 4)}-01-01`;
      const lastYear = String(Number(today.slice(0, 4)) - 1);
      const prevTo = shiftMonths(today, 12);
      return {
        preset,
        ...rangeOf(from, today),
        previous: { from: `${lastYear}-01-01`, to: prevTo },
      };
    }
    case "custom": {
      if (!params.from || !params.to) return resolvePeriod({ ...params, period: "30d" }, today);
      let [from, to] =
        params.from <= params.to ? [params.from, params.to] : [params.to, params.from];
      if (to > today) to = today;
      if (from > to) from = to;
      if (daysBetween(from, to) + 1 > MAX_PERIOD_DAYS) from = addDays(to, -(MAX_PERIOD_DAYS - 1));
      const r = rangeOf(from, to);
      return { preset, ...r, previous: before(from, r.days) };
    }
  }
}

/**
 * The instants that bound a range of local days: [start of `from`, start of the day after
 * `to`) in the time zone, as ISO strings. Comparing timestamps with these keeps the leads,
 * viewings and deals indexes usable (no per-row time zone conversion) and handles daylight
 * saving.
 */
export function utcBounds(range: DateRange, timeZone: string): { start: string; end: string } {
  const start = wallTimeToIso(`${range.from}T00:00`, timeZone) ?? `${range.from}T00:00:00.000Z`;
  const next = addDays(range.to, 1);
  const end = wallTimeToIso(`${next}T00:00`, timeZone) ?? `${next}T00:00:00.000Z`;
  return { start, end };
}

/** The local days of a range, in order. */
export function eachDay(range: DateRange): string[] {
  const n = daysBetween(range.from, range.to) + 1;
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(range.from, i));
}

export type Change = {
  /** current - previous */
  delta: number;
  /** Relative change (0.25 = +25%); null when the previous value was 0. */
  ratio: number | null;
  direction: "up" | "down" | "same";
};

export function compare(current: number, previous: number): Change {
  const delta = current - previous;
  return {
    delta,
    ratio: previous === 0 ? null : delta / previous,
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "same",
  };
}

/** Share of `part` in `whole` (0..1); 0 when there is nothing to divide. */
export function rate(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

/** URL params that reproduce a period (for links between reports and exports). */
export function periodQuery(period: Period): Record<string, string> {
  return period.preset === "custom"
    ? { period: "custom", from: period.from, to: period.to }
    : { period: period.preset };
}
