import { compactAmount } from "@/lib/currency-display";

/**
 * Title patterns from Settings -> SEO (04 §7) with %variables%: "%beds% bed %type% for
 * %purpose% in %area%". A pattern that needs a value the page does not have falls back to
 * the page's own name, so a title never has gaps. Plain functions: the admin previews use
 * them too.
 */

export type PatternValues = Record<string, string | number | null | undefined>;

const VAR = /%(\w+)%/g;

/** The %variables% a pattern uses. */
export function patternVariables(pattern: string): string[] {
  return [...pattern.matchAll(VAR)].map((m) => m[1]!);
}

/**
 * Fills a pattern. `beds` of 0 reads "Studio" and takes the word after it ("bed",
 * "bedroom") along; any missing value means the fallback.
 */
export function fillPattern(
  pattern: string,
  values: PatternValues,
  fallback: string,
  { studio = "Studio" }: { studio?: string } = {},
): string {
  let text = pattern;
  if (values.beds === 0) text = text.replace(/%beds%([\s-]+(?:bed(?:room)?s?|br)\b)?/gi, studio);
  let missing = false;
  const filled = text.replace(VAR, (_, key: string) => {
    const v = values[key];
    if (v === null || v === undefined || v === "") {
      missing = true;
      return "";
    }
    return String(v);
  });
  if (missing) return fallback;
  return filled.replace(/\s+/g, " ").trim() || fallback;
}

export type ListingTitleInput = {
  title: string;
  beds: number | null;
  purpose: "sale" | "rent";
  typeName: string | null;
  /** The listing's area (the most specific place above the building). */
  area: string | null;
  city: string | null;
  price: number | null;
  currency: string;
  /** Decimals of the listing currency, for %price%. */
  decimals: number;
  reference: string;
  agency: string;
};

/** "2 bed Apartment for sale in Old Harbour" (Settings -> SEO -> Listing titles). */
export function listingSeoTitle(pattern: string, l: ListingTitleInput): string {
  return fillPattern(
    pattern,
    {
      beds: l.beds,
      type: l.typeName,
      purpose: l.purpose,
      area: l.area,
      city: l.city,
      price: l.price != null ? `${l.currency} ${compactAmount(l.price, l.decimals)}` : null,
      reference: l.reference,
      title: l.title,
      agency: l.agency,
    },
    l.title,
  );
}

/** "Pier Seven by Dune Homes in Old Harbour" (Settings -> SEO -> Project titles). */
export function projectSeoTitle(
  pattern: string,
  p: { name: string; developer: string | null; area: string | null; agency: string },
): string {
  return fillPattern(
    pattern,
    { project: p.name, developer: p.developer, area: p.area, agency: p.agency },
    p.name,
  );
}

/** "Living in Old Harbour: area guide" (Settings -> SEO -> Area guide titles). */
export function areaGuideSeoTitle(
  pattern: string,
  g: { title: string; area: string; city: string | null; agency: string },
): string {
  return fillPattern(
    pattern,
    { area: g.area, city: g.city, title: g.title, agency: g.agency },
    g.title,
  );
}

/** Blog posts (Settings -> SEO -> Blog post titles). */
export function postSeoTitle(
  pattern: string,
  p: { title: string; category: string | null; agency: string },
): string {
  return fillPattern(pattern, { title: p.title, category: p.category, agency: p.agency }, p.title);
}

/**
 * The site title pattern ("%page% | %agency%") as a Next.js title template ("%s | Agency").
 * A pattern without %page% gets the page title in front.
 */
export function siteTitleTemplate(pattern: string, agency: string): string {
  const withAgency = pattern.replace(/%agency%/g, agency);
  return withAgency.includes("%page%")
    ? withAgency.replace(/%page%/g, "%s")
    : `%s ${withAgency}`.trim();
}
