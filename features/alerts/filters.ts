import { parseSearch, type SearchFilters } from "@/features/search/params";
import type { GeoPolygon } from "@/lib/geo";

/**
 * The search a saved search stands for (12 §2): its filters are stored in the search URL's
 * shape (`{ loc: ["dubai-marina"], beds: ["2"], max: "3000000" }`); a drawn area may also be
 * in its own column. Parsed with the same rules as the search page, so an alert matches
 * exactly what the customer saw. Pure.
 */
export function savedSearchFilters(
  filters: Record<string, unknown> | null | undefined,
  polygon: GeoPolygon | null | undefined,
): SearchFilters {
  const params = new URLSearchParams();
  let ring: Array<[number, number]> | null = null;
  for (const [key, value] of Object.entries(filters ?? {})) {
    // A filters object may carry the area as a ring of [lng, lat] pairs.
    if (key === "poly" && Array.isArray(value) && Array.isArray(value[0])) {
      ring = (value as Array<[number, number]>).filter(
        (p) => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(n)),
      );
      continue;
    }
    for (const v of Array.isArray(value) ? value : [value])
      if (v !== null && v !== undefined && v !== "" && typeof v !== "object")
        params.append(key, String(v));
  }
  const parsed = parseSearch(params);
  const outer = polygon?.type === "Polygon" ? polygon.coordinates[0] : polygon?.coordinates[0]?.[0];
  const fromColumn = outer
    ? outer
        .slice(0, outer.length > 1 && samePoint(outer[0]!, outer.at(-1)!) ? -1 : undefined)
        .map(([lng, lat]) => [lng, lat] as [number, number])
    : null;
  const poly = fromColumn ?? (ring && ring.length >= 3 ? ring : null) ?? parsed.poly;
  return { ...parsed, poly, sort: "newest", page: 1 };
}

const samePoint = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1];
