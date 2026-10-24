/**
 * Best value per row on the compare page (11 §3: lowest price per area, highest yield, nearest
 * school…). Pure and client-safe. Values must already be comparable: money in the base
 * currency's minor units, distances in metres.
 */

export const bestRules = {
  pricePerArea: "min",
  serviceCharge: "min",
  yield: "max",
  school: "min",
  transport: "min",
  shopping: "min",
} as const;

export type BestRow = keyof typeof bestRules;
export type CompareNumbers = Record<BestRow, number | null>;

/**
 * Indexes of the best values (all of them when tied). Nothing is highlighted when fewer than
 * two items have a value, or when every value is the same (there is no winner then).
 */
export function bestIndexes(values: ReadonlyArray<number | null>, rule: "min" | "max"): number[] {
  const known = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null && Number.isFinite(x.v));
  if (known.length < 2) return [];
  const target =
    rule === "min" ? Math.min(...known.map((x) => x.v)) : Math.max(...known.map((x) => x.v));
  const best = known.filter((x) => x.v === target).map((x) => x.i);
  return best.length === known.length ? [] : best;
}

/** For each highlighted row, the columns holding its best value. */
export function compareHighlights(items: ReadonlyArray<CompareNumbers>): Record<BestRow, number[]> {
  const out = {} as Record<BestRow, number[]>;
  for (const row of Object.keys(bestRules) as BestRow[])
    out[row] = bestIndexes(
      items.map((it) => it[row]),
      bestRules[row],
    );
  return out;
}

/** Gross yield in % with one decimal: yearly rent over price (same currency). */
export function grossYield(price: number | null, rentYearly: number | null): number | null {
  if (!price || !rentYearly || price <= 0 || rentYearly <= 0) return null;
  return Math.round((rentYearly / price) * 1000) / 10;
}

/** Ids from a share link (`?ids=a,b,c`): valid uuids only, no repeats, at most four. */
export function parseCompareIds(raw: string | string[] | undefined, max = 4): string[] {
  const text = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return [...new Set(text.split(",").map((s) => s.trim().toLowerCase()))]
    .filter((s) => uuid.test(s))
    .slice(0, max);
}

/** The share link path: the same table for anyone who opens it. */
export const comparePath = (ids: string[]) => `/tools/compare?ids=${ids.join(",")}`;
