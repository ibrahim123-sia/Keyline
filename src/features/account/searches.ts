import { closeRing, type GeoPolygon } from "@/lib/geo";
import type { CurrencyFormat } from "@/lib/money";
import type { AreaUnit } from "@/lib/units";
import { searchChips, searchHeading, type SearchLabels } from "@/features/search/labels";
import { parseSearch, searchQuery, type SearchFilters } from "@/features/search/params";

/** Customer limits (12 §4). */
export const MAX_SAVED_SEARCHES = 20;
export const MAX_SAVED_HOMES = 500;
export const MAX_COMPARE = 4;

/** URL parameters as stored on a saved search: the same shape as the search URL (05 §13). */
export type StoredFilters = Record<string, string | string[]>;

/** A search as stored: every filter, no paging or sort (the alert decides the order). */
export function filtersToStored(f: SearchFilters): StoredFilters {
  const params = new URLSearchParams(searchQuery({ ...f, page: 1, sort: "newest" }));
  const out: StoredFilters = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    out[key] = all.length === 1 ? all[0]! : all;
  }
  return out;
}

export function storedToFilters(stored: StoredFilters): SearchFilters {
  return parseSearch(stored);
}

/** The drawn area as a closed GeoJSON polygon for PostGIS, or null. */
export function polygonOf(f: SearchFilters): GeoPolygon | null {
  if (!f.poly || f.poly.length < 3) return null;
  return { type: "Polygon", coordinates: [closeRing(f.poly)] };
}

/** "Apartments for sale in Dubai Marina · 2 beds · Up to AED 2M" for lists and emails. */
export function filtersSummary(
  f: SearchFilters,
  labels: SearchLabels,
  units: { currency: CurrencyFormat; areaUnit: AreaUnit },
): string {
  return [searchHeading(f, labels), ...searchChips(f, labels, units).map((c) => c.label)].join(
    " · ",
  );
}

/** A default name for a new saved search: its heading. */
export const defaultSearchName = (f: SearchFilters, labels: SearchLabels) =>
  searchHeading(f, labels).slice(0, 80);
