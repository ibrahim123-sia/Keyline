import { roundForDisplay } from "@/lib/currency-display";

/**
 * Valuation range from comparable own listings (11 §5, 10 §5 "Valuation range"). Pure: no
 * database and no clock, so the public valuation and Phase 9's AI helper give the same answer.
 *
 * Method
 * 1. Comparables are the agency's own listings with the same purpose (sell = for sale, rent =
 *    to rent), in the chosen area or anywhere inside it, of the same property type, with the
 *    same number of bedrooms (studio = 0) and a size within ±20% of the home's size. Only
 *    listings with a known price and size count; the caller passes live, sold and rented
 *    listings in one currency (rents in one period).
 * 2. With fewer than 3 comparables there is no number ("not enough data"): an agent values it.
 * 3. Otherwise each comparable gives a price per m². The range is the lower and upper quartile
 *    of those prices times the home's size, the middle is the median, each rounded to three
 *    significant figures (an estimate, not a quote). With more than 10 comparables, the 10
 *    closest in size are used.
 */

export type ValuationPurpose = "sale" | "rent";

export type ValuationSubject = {
  purpose: ValuationPurpose;
  propertyTypeId: string;
  /** The chosen area and every location inside it. */
  areaLocationIds: Iterable<string>;
  /** Bedrooms (0 = studio); null for types without bedrooms (offices, plots). */
  beds: number | null;
  /** m² */
  size: number;
};

export type ComparableCandidate = {
  id: string;
  purpose: ValuationPurpose;
  propertyTypeId: string | null;
  locationId: string | null;
  beds: number | null;
  /** m² */
  size: number | null;
  /** Minor units, in the estimate's currency (rents in one period). */
  price: number | null;
};

export type Comparable = ComparableCandidate & {
  size: number;
  price: number;
  /** Minor units per m². */
  pricePerSqm: number;
};

export type ValuationRules = {
  minComparables: number;
  /** ±share of the home's size, e.g. 0.2 for ±20%. */
  sizeTolerance: number;
  maxComparables: number;
};

export const valuationRules: ValuationRules = {
  minComparables: 3,
  sizeTolerance: 0.2,
  maxComparables: 10,
};

export type ValuationEstimate =
  | {
      status: "estimate";
      /** Minor units, rounded to three significant figures. */
      low: number;
      mid: number;
      high: number;
      /** Minor units per m² (not rounded): lower quartile, median, upper quartile. */
      perSqm: { low: number; median: number; high: number };
      comparables: Comparable[];
    }
  | { status: "not_enough_data"; comparables: Comparable[] };

/** Is `size` within ±tolerance of `target` (both m²)? Inclusive at the edges. */
export function sizeWithin(target: number, size: number, tolerance: number): boolean {
  return Math.abs(size - target) <= target * tolerance + 1e-9;
}

/** The value at quantile q (0..1) of an ascending list, by linear interpolation. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) throw new Error("quantile of an empty list");
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export const median = (sorted: readonly number[]): number => quantile(sorted, 0.5);

/** The listings that compare with the home (step 1), closest in size first. */
export function findComparables(
  subject: ValuationSubject,
  candidates: readonly ComparableCandidate[],
  rules: ValuationRules = valuationRules,
): Comparable[] {
  const area = new Set(subject.areaLocationIds);
  const beds = subject.beds ?? null;
  const matches: Comparable[] = [];
  for (const c of candidates) {
    if (c.purpose !== subject.purpose) continue;
    if (c.propertyTypeId !== subject.propertyTypeId) continue;
    if (!c.locationId || !area.has(c.locationId)) continue;
    if ((c.beds ?? null) !== beds) continue;
    if (c.size == null || !(c.size > 0) || c.price == null || !(c.price > 0)) continue;
    if (!sizeWithin(subject.size, c.size, rules.sizeTolerance)) continue;
    matches.push({ ...c, size: c.size, price: c.price, pricePerSqm: c.price / c.size });
  }
  return matches
    .sort(
      (a, b) =>
        Math.abs(a.size - subject.size) - Math.abs(b.size - subject.size) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, rules.maxComparables);
}

/**
 * The estimate for a home (steps 2 and 3). `decimals` is the currency's minor-unit digits,
 * for rounding to whole, three-significant-figure amounts.
 */
export function estimateValuation(
  subject: ValuationSubject,
  candidates: readonly ComparableCandidate[],
  options: { decimals: number; rules?: ValuationRules },
): ValuationEstimate {
  const rules = options.rules ?? valuationRules;
  const comparables = findComparables(subject, candidates, rules);
  if (comparables.length < rules.minComparables || !(subject.size > 0))
    return { status: "not_enough_data", comparables };
  const perSqm = comparables.map((c) => c.pricePerSqm).sort((a, b) => a - b);
  const q1 = quantile(perSqm, 0.25);
  const q2 = median(perSqm);
  const q3 = quantile(perSqm, 0.75);
  const round = (perUnit: number) =>
    roundForDisplay(Math.round(perUnit * subject.size), options.decimals);
  return {
    status: "estimate",
    low: round(q1),
    mid: round(q2),
    high: round(q3),
    perSqm: { low: q1, median: q2, high: q3 },
    comparables,
  };
}
