import type { Requirements } from "@/db/schema/crm";
import { toBaseMinor, type Rates } from "@/lib/currency-display";

/** What the matching listings search looks for, from a lead's requirements (09 §4). Pure. */
export type MatchCriteria = {
  purpose: "sale" | "rent" | null;
  locationIds: string[];
  propertyTypeIds: string[];
  bedsMin: number | null;
  /** Minor units of the base currency. */
  minBase: number | null;
  maxBase: number | null;
};

export function matchCriteria(r: Requirements, rates: Rates): MatchCriteria {
  const currency = r.currency ?? rates.base.code;
  const toBase = (v: number | null | undefined) =>
    v === null || v === undefined ? null : toBaseMinor(v, currency, rates);
  return {
    purpose: r.purpose ?? null,
    locationIds: r.locationIds ?? [],
    propertyTypeIds: r.propertyTypeIds ?? [],
    bedsMin: r.bedsMin ?? null,
    minBase: toBase(r.budgetMin),
    maxBase: toBase(r.budgetMax),
  };
}

/** Enough to search on: at least a purpose, a place, a type or a budget. */
export function hasCriteria(c: MatchCriteria): boolean {
  return Boolean(
    c.purpose ||
    c.locationIds.length ||
    c.propertyTypeIds.length ||
    c.minBase !== null ||
    c.maxBase !== null,
  );
}
