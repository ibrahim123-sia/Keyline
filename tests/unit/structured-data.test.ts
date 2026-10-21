import { describe, expect, it } from "vitest";
import { jsonForScript } from "@/components/site/json-ld";
import {
  listingJsonLd,
  organizationJsonLd,
  projectJsonLd,
  websiteJsonLd,
  type ListingSchemaInput,
} from "@/features/seo/structured-data";

const origin = "https://agency.example";

const listing: ListingSchemaInput = {
  url: `${origin}/property/sea-view`,
  origin,
  title: "Sea-view flat",
  description: "Bright, high floor.",
  reference: "LT-1001",
  status: "available",
  purpose: "sale",
  price: 125_000_050,
  currency: "AED",
  decimals: 2,
  pricePeriod: null,
  beds: 2,
  baths: 2,
  size: 102.5,
  typeName: "Apartment",
  places: [
    { name: "Coastal City", level: "city" },
    { name: "Old Harbour", level: "area" },
    { name: "Pier Tower", level: "building" },
  ],
  countryCode: "AE",
  point: { lat: 25.08, lng: 55.14 },
  images: [`${origin}/media/a.jpg?w=1200&q=75`],
  publishedAt: "2026-10-01T00:00:00.000Z",
};

type Node = Record<string, unknown>;
const nodes = (data: Node) => data["@graph"] as Node[];

describe("structured data", () => {
  it("escapes everything that could end the script tag", () => {
    const ls = String.fromCharCode(0x2028);
    const value = { a: `</script><b>&amp;${ls}` };
    const out = jsonForScript(value);
    expect(out).not.toMatch(/[<>&]/);
    expect(out.includes(ls)).toBe(false);
    expect(JSON.parse(out)).toEqual(value);
  });

  it("describes the agency and the site search", () => {
    const org = organizationJsonLd({
      origin,
      name: "Haven & Dune",
      logoUrl: `${origin}/media/logo.png`,
      phone: "+971 4 000 0000",
      address: "Pier 7\nOld Harbour",
      sameAs: ["https://instagram.com/x", "https://instagram.com/x"],
      email: "",
    });
    expect(org).toMatchObject({
      "@type": "RealEstateAgent",
      "@id": `${origin}/#organization`,
      address: { "@type": "PostalAddress", streetAddress: "Pier 7, Old Harbour" },
      sameAs: ["https://instagram.com/x"],
    });
    expect(org).not.toHaveProperty("email");
    expect(websiteJsonLd({ origin, name: "H", searchPath: "/buy" })).toMatchObject({
      "@type": "WebSite",
      potentialAction: {
        "@type": "SearchAction",
        target: { urlTemplate: `${origin}/buy?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    });
  });

  it("describes a listing as a RealEstateListing with a Product offer", () => {
    const [page, home] = nodes(listingJsonLd(listing));
    expect(page).toMatchObject({
      "@type": "RealEstateListing",
      url: listing.url,
      datePosted: "2026-10-01T00:00:00.000Z",
      mainEntity: { "@id": `${listing.url}#home` },
    });
    expect(home).toMatchObject({
      "@type": ["Product", "Accommodation"],
      sku: "LT-1001",
      offers: {
        "@type": "Offer",
        price: 1_250_000.5,
        priceCurrency: "AED",
        availability: "https://schema.org/InStock",
      },
      address: {
        addressLocality: "Old Harbour",
        addressRegion: "Coastal City",
        addressCountry: "AE",
      },
      geo: { latitude: 25.08, longitude: 55.14 },
      numberOfBedrooms: 2,
      floorSize: { value: 102.5, unitCode: "MTK" },
    });

    const rent = nodes(
      listingJsonLd({
        ...listing,
        purpose: "rent",
        pricePeriod: "year",
        status: "rented",
        point: null,
      }),
    )[1]!;
    expect(rent.offers).toMatchObject({
      availability: "https://schema.org/SoldOut",
      businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
      priceSpecification: { "@type": "UnitPriceSpecification", unitCode: "ANN" },
    });
    expect(rent).not.toHaveProperty("geo");

    // Price on request: the page only, no Product without an offer.
    const onRequest = nodes(listingJsonLd({ ...listing, price: null }));
    expect(onRequest).toHaveLength(1);
    expect(onRequest[0]).not.toHaveProperty("offers");
  });

  it("describes a project, with an aggregate offer when it has a starting price", () => {
    const input = {
      url: `${origin}/projects/pier-seven`,
      origin,
      name: "Pier Seven",
      description: "Waterfront homes.",
      developer: "Dune Homes",
      places: [{ name: "Coastal City" }, { name: "Old Harbour" }],
      countryCode: null,
      point: null,
      images: [],
      startingPrice: 90_000_000,
      currency: "AED",
      decimals: 2,
      listingCount: 4,
    };
    const [project] = nodes(projectJsonLd(input));
    expect(project).toMatchObject({
      "@type": ["Product", "Residence"],
      brand: { "@type": "Brand", name: "Dune Homes" },
      offers: { "@type": "AggregateOffer", lowPrice: 900_000, priceCurrency: "AED", offerCount: 4 },
      address: { addressLocality: "Old Harbour", addressRegion: "Coastal City" },
    });
    const [plain] = nodes(projectJsonLd({ ...input, startingPrice: null }));
    expect(plain).toMatchObject({ "@type": "Residence" });
    expect(plain).not.toHaveProperty("brand");
    expect(plain).not.toHaveProperty("offers");
  });
});
