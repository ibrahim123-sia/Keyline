/**
 * SEO landing pages (08 §6): every area x purpose gets a page, area x type pages count as
 * "generated" (indexed, in the sitemap, linked) only with enough listings, and any search
 * page with fewer than the thin-page minimum gets noindex.
 */
export type LandingKind = "hub" | "area" | "type";

export type LandingRules = { thinPageMinListings: number; landingTypeMinListings: number };

export function landingIndexable(kind: LandingKind, count: number, rules: LandingRules): boolean {
  if (count < rules.thinPageMinListings) return false;
  if (kind === "type" && count < rules.landingTypeMinListings) return false;
  return true;
}
