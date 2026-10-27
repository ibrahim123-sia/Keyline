import "server-only";
import type { PublicListing } from "@/features/listings/public";
import type { PublicProject } from "@/features/projects/public";
import type { SettingsOf } from "@/features/settings/schema";
import { mediaVariant } from "@/lib/media-src";
import { listingJsonLd, projectJsonLd } from "./structured-data";
import { listingSeoTitle, projectSeoTitle } from "./titles";

type Market = Pick<SettingsOf<"market">, "baseCurrency" | "visitorCurrencies" | "countryCode">;

/** Decimals of a currency the market knows (2 for anything else). */
export function currencyDecimals(market: Market, code: string): number {
  if (market.baseCurrency.code === code) return market.baseCurrency.decimals;
  return market.visitorCurrencies.find((c) => c.code === code)?.decimals ?? 2;
}

const areaOf = (places: PublicListing["places"]) =>
  places.filter((p) => p.level !== "building").at(-1)?.name ?? null;
const cityOf = (places: PublicListing["places"]) =>
  places.find((p) => p.level === "city")?.name ?? null;

/** The listing's title tag: its own SEO title, else the listing title pattern. */
export function listingTitle(
  l: PublicListing,
  pattern: string,
  market: Market,
  agency: string,
): string {
  if (l.seo.title) return l.seo.title;
  return listingSeoTitle(pattern, {
    title: l.title,
    beds: l.beds,
    purpose: l.purpose,
    typeName: l.type?.name ?? null,
    area: areaOf(l.places),
    city: cityOf(l.places),
    price: l.price,
    currency: l.currency,
    decimals: currencyDecimals(market, l.currency),
    reference: l.reference,
    agency,
  });
}

const absolute = (origin: string, url: string) => new URL(url, `${origin}/`).toString();

export function listingStructuredData(l: PublicListing, market: Market, origin: string) {
  return listingJsonLd({
    url: `${origin}/property/${l.slug}`,
    origin,
    title: l.title,
    description: (l.seo.description || l.descriptionText).slice(0, 500),
    reference: l.reference,
    status: l.status,
    purpose: l.purpose,
    price: l.price,
    currency: l.currency,
    decimals: currencyDecimals(market, l.currency),
    pricePeriod: l.pricePeriod,
    beds: l.beds,
    baths: l.baths,
    size: l.size,
    typeName: l.type?.name ?? null,
    places: l.places,
    countryCode: market.countryCode,
    point: l.point && !l.point.approx ? { lat: l.point.lat, lng: l.point.lng } : null,
    images: l.photos.slice(0, 6).map((p) => absolute(origin, mediaVariant(p.url, 1200))),
    publishedAt: l.publishedAt,
  });
}

export function projectTitle(p: PublicProject, pattern: string, agency: string): string {
  if (p.seo.title) return p.seo.title;
  return projectSeoTitle(pattern, {
    name: p.name,
    developer: p.developer?.name ?? null,
    area: p.locationPath.at(-1)?.name ?? null,
    agency,
  });
}

export function projectStructuredData(
  p: PublicProject,
  market: Market,
  origin: string,
  description: string,
) {
  const currency = p.currency || market.baseCurrency.code;
  return projectJsonLd({
    url: `${origin}/projects/${p.slug}`,
    origin,
    name: p.name,
    description: description.slice(0, 500),
    developer: p.developer?.name ?? null,
    places: p.locationPath,
    countryCode: market.countryCode,
    point: p.point,
    images: p.photos.slice(0, 6).map((ph) => absolute(origin, mediaVariant(ph.url, 1200))),
    startingPrice: p.startingPrice,
    currency,
    decimals: currencyDecimals(market, currency),
    listingCount: p.listings.length,
  });
}
