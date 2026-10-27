/**
 * Structured data (08 §6 JSON-LD) built from our own records. Plain functions returning
 * schema.org objects; components/site/json-ld.tsx writes them into the page.
 */

type Json = Record<string, unknown>;

const compact = (o: Json): Json =>
  Object.fromEntries(
    Object.entries(o).filter(
      ([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length),
    ),
  );

export const orgId = (origin: string) => `${origin}/#organization`;
export const websiteId = (origin: string) => `${origin}/#website`;

/** The agency (RealEstateAgent, a LocalBusiness): name, logo, contact and profiles. */
export function organizationJsonLd(o: {
  origin: string;
  name: string;
  legalName?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  sameAs?: string[];
}): Json {
  return compact({
    "@type": "RealEstateAgent",
    "@id": orgId(o.origin),
    name: o.name,
    legalName: o.legalName,
    description: o.description,
    url: `${o.origin}/`,
    logo: o.logoUrl,
    image: o.logoUrl,
    telephone: o.phone,
    email: o.email,
    address: o.address
      ? { "@type": "PostalAddress", streetAddress: o.address.replace(/\s*\n\s*/g, ", ") }
      : undefined,
    sameAs: [...new Set(o.sameAs ?? [])],
  });
}

/** The site, with a search box pointing at the sale search (`q` is free text there). */
export function websiteJsonLd(o: { origin: string; name: string; searchPath: string }): Json {
  return {
    "@type": "WebSite",
    "@id": websiteId(o.origin),
    url: `${o.origin}/`,
    name: o.name,
    publisher: { "@id": orgId(o.origin) },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${o.origin}${o.searchPath}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export const graph = (nodes: Json[]): Json => ({
  "@context": "https://schema.org",
  "@graph": nodes,
});

const availability: Record<string, string> = {
  available: "https://schema.org/InStock",
  reserved: "https://schema.org/LimitedAvailability",
  under_offer: "https://schema.org/LimitedAvailability",
  sold: "https://schema.org/SoldOut",
  rented: "https://schema.org/SoldOut",
};

/** A price in major units with at most the currency's decimals, as schema.org wants. */
const major = (minor: number, decimals: number) =>
  Number((minor / 10 ** decimals).toFixed(decimals));

export type ListingSchemaInput = {
  url: string;
  origin: string;
  title: string;
  description: string;
  reference: string;
  status: string;
  purpose: "sale" | "rent";
  price: number | null;
  currency: string;
  decimals: number;
  pricePeriod: "year" | "month" | null;
  beds: number | null;
  baths: number | null;
  /** m² */
  size: number | null;
  typeName: string | null;
  /** The listing's places, outermost first (as on the page). */
  places: Array<{ name: string; level: string }>;
  countryCode: string | null;
  /** Only an exact pin is shared; approximate locations are left out. */
  point: { lat: number; lng: number } | null;
  images: string[];
  publishedAt: string | null;
};

/**
 * A listing (08 §6): the page as a RealEstateListing, and the home itself as a Product with
 * an Offer (price, currency, availability) plus its place (locality, rooms, floor size).
 * Without a price there is no offer, and no Product.
 */
export function listingJsonLd(l: ListingSchemaInput): Json {
  const homeId = `${l.url}#home`;
  const nonBuilding = l.places.filter((p) => p.level !== "building");
  const locality = nonBuilding.at(-1)?.name;
  const region = nonBuilding.find((p) => p.level === "city")?.name;
  const address = compact({
    "@type": "PostalAddress",
    addressLocality: locality,
    addressRegion: region && region !== locality ? region : undefined,
    addressCountry: l.countryCode,
  });
  const offer =
    l.price != null
      ? compact({
          "@type": "Offer",
          url: l.url,
          price: major(l.price, l.decimals),
          priceCurrency: l.currency,
          availability: availability[l.status],
          businessFunction:
            l.purpose === "rent"
              ? "http://purl.org/goodrelations/v1#LeaseOut"
              : "http://purl.org/goodrelations/v1#Sell",
          priceSpecification:
            l.purpose === "rent" && l.pricePeriod
              ? {
                  "@type": "UnitPriceSpecification",
                  price: major(l.price, l.decimals),
                  priceCurrency: l.currency,
                  unitCode: l.pricePeriod === "month" ? "MON" : "ANN",
                }
              : undefined,
          seller: { "@id": orgId(l.origin) },
        })
      : null;
  const page = compact({
    "@type": "RealEstateListing",
    "@id": `${l.url}#listing`,
    url: l.url,
    name: l.title,
    description: l.description,
    datePosted: l.publishedAt,
    image: l.images,
    mainEntity: offer ? { "@id": homeId } : undefined,
    offers: offer ?? undefined,
  });
  if (!offer) return graph([page]);
  const home = compact({
    "@type": ["Product", l.beds != null ? "Accommodation" : "Place"],
    "@id": homeId,
    name: l.title,
    description: l.description,
    sku: l.reference,
    category: l.typeName,
    image: l.images,
    url: l.url,
    offers: offer,
    address: Object.keys(address).length > 1 ? address : undefined,
    geo: l.point
      ? { "@type": "GeoCoordinates", latitude: l.point.lat, longitude: l.point.lng }
      : undefined,
    numberOfBedrooms: l.beds,
    numberOfRooms: l.beds,
    numberOfBathroomsTotal: l.baths,
    floorSize:
      l.size != null ? { "@type": "QuantitativeValue", value: l.size, unitCode: "MTK" } : undefined,
  });
  return graph([page, home]);
}

export type ProjectSchemaInput = {
  url: string;
  origin: string;
  name: string;
  description: string;
  developer: string | null;
  places: Array<{ name: string }>;
  countryCode: string | null;
  point: { lat: number; lng: number } | null;
  images: string[];
  startingPrice: number | null;
  currency: string;
  decimals: number;
  /** Live listings in the project, for the offer count. */
  listingCount: number;
};

/**
 * A project (off-plan development): the place (Residence, with locality and pin) and, with
 * a starting price, a Product with an AggregateOffer from that price.
 */
export function projectJsonLd(p: ProjectSchemaInput): Json {
  const address = compact({
    "@type": "PostalAddress",
    addressLocality: p.places.at(-1)?.name,
    addressRegion: p.places.length > 1 ? p.places[0]?.name : undefined,
    addressCountry: p.countryCode,
  });
  const offers =
    p.startingPrice != null
      ? compact({
          "@type": "AggregateOffer",
          lowPrice: major(p.startingPrice, p.decimals),
          priceCurrency: p.currency,
          offerCount: p.listingCount || undefined,
          url: p.url,
          seller: { "@id": orgId(p.origin) },
        })
      : undefined;
  return graph([
    compact({
      "@type": offers ? ["Product", "Residence"] : "Residence",
      "@id": `${p.url}#project`,
      name: p.name,
      description: p.description,
      url: p.url,
      image: p.images,
      // A brand belongs to the Product; a plain Residence has none.
      brand: offers && p.developer ? { "@type": "Brand", name: p.developer } : undefined,
      address: Object.keys(address).length > 1 ? address : undefined,
      geo: p.point
        ? { "@type": "GeoCoordinates", latitude: p.point.lat, longitude: p.point.lng }
        : undefined,
      offers,
    }),
  ]);
}
