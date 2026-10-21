import "server-only";
import { parseSearch } from "@/features/search/params";
import { searchListings } from "@/features/search/query";
import { siteRates } from "@/features/site/currency";
import { toBaseMinor } from "@/lib/currency-display";
import type { ListingCardData } from "./cards";
import type { PublicListing } from "./public";

/** The area a listing belongs to for "similar homes": its area, else community, else city. */
export function similarArea(places: PublicListing["places"]): string | null {
  for (const level of ["area", "community", "city"]) {
    const place = [...places].reverse().find((p) => p.level === level);
    if (place) return place.slug;
  }
  return null;
}

/**
 * Similar homes (06 §5.15): same purpose and area, price within ±20% (compared in the base
 * currency) and one bedroom more or less; live listings only, this one left out.
 */
export async function similarListings(l: PublicListing, limit = 6): Promise<ListingCardData[]> {
  const rates = await siteRates();
  const base = l.price != null ? toBaseMinor(l.price, l.currency, rates) : null;
  const scale = 10 ** rates.base.decimals;
  const area = similarArea(l.places);
  const beds =
    l.beds == null
      ? undefined
      : [...new Set([l.beds - 1, l.beds, l.beds + 1].map((b) => Math.min(5, Math.max(0, b))))];
  const filters = parseSearch({
    purpose: l.purpose,
    ...(area ? { loc: area } : {}),
    ...(base != null
      ? {
          min: String(Math.floor((base * 0.8) / scale)),
          max: String(Math.ceil((base * 1.2) / scale)),
        }
      : {}),
    ...(beds ? { beds: beds.map(String) } : {}),
  });
  const result = await searchListings(filters);
  return result.cards.filter((c) => c.id !== l.id).slice(0, limit);
}
