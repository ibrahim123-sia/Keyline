import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { loadSettings } from "@/features/settings/queries";
import { localDateString } from "@/lib/local-date";
import { resolvePeriod, utcBounds, type DateRange, type PeriodParams } from "./period";
import type { ReportContext } from "./types";

/** Period, time zone and base currency for one report run (Settings -> General and Market). */
export async function loadReportContext(
  db: DbOrTx,
  params: PeriodParams,
  now: Date = new Date(),
): Promise<ReportContext> {
  const [general, market] = [await loadSettings("general", db), await loadSettings("market", db)];
  const today = localDateString(now, general.timeZone);
  const base = market.baseCurrency;
  return {
    period: resolvePeriod(params, today),
    timeZone: general.timeZone,
    today,
    now,
    currency: {
      code: base.code,
      symbol: base.symbol,
      symbolPosition: base.symbolPosition,
      decimals: base.decimals,
    },
  };
}

/** `column` falls on one of the range's local days (index-friendly instant bounds). */
export function within(column: SQL, range: DateRange, timeZone: string): SQL {
  const { start, end } = utcBounds(range, timeZone);
  return sql`${column} >= ${start}::timestamptz and ${column} < ${end}::timestamptz`;
}

export const agency = (): SQL => sql`${currentAgencyId()}::uuid`;

/** Number from a pg value (numeric and bigint arrive as strings). */
export function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
