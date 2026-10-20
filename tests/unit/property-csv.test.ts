import { describe, expect, it } from "vitest";
import {
  autoMap,
  checkRow,
  mappingProblems,
  parseBoolean,
  parseDate,
  parseHandover,
  parseMoney,
  parseNumber,
  templateFields,
  textToDoc,
  type FieldKey,
  type ImportContext,
} from "@/features/properties/csv";

const ctx: ImportContext = {
  areaUnit: "sqft",
  dateOrder: "dmy",
  baseCurrency: "AED",
  currencies: { AED: 2, USD: 2, JPY: 0 },
  rentPeriod: "year",
  furnishingOptions: ["Unfurnished", "Semi-furnished", "Furnished"],
  ownershipTypes: ["Freehold", "Leasehold"],
  types: [
    { id: "t-apt", name: "Apartment", slug: "apartments" },
    { id: "t-villa", name: "Villa", slug: "villas" },
  ],
  locations: [
    { id: "l-dubai", name: "Dubai", slug: "dubai", parentName: null },
    { id: "l-marina", name: "Dubai Marina", slug: "dubai-marina", parentName: "Dubai" },
    { id: "l-hills-1", name: "The Hills", slug: "the-hills-dubai", parentName: "Dubai" },
    { id: "l-hills-2", name: "The Hills", slug: "the-hills-ajman", parentName: "Ajman" },
  ],
  agents: [
    {
      id: "a-sara",
      name: "Sara Khan",
      slug: "sara-khan",
      email: "sara@agency.example",
      isActive: true,
    },
    { id: "a-old", name: "Omar Old", slug: "omar-old", email: null, isActive: false },
  ],
  facilities: [
    { id: "f-pool", name: "Pool" },
    { id: "f-gym", name: "Gym" },
  ],
};

/** One row from a header -> value object, mapped automatically. */
function row(values: Record<string, string>) {
  const headers = Object.keys(values);
  const columns = autoMap(headers, ctx.areaUnit);
  return checkRow(Object.values(values), columns, ctx);
}

describe("values", () => {
  it.each([
    ["1,250,000", 1_250_000],
    ["1.250.000", 1_250_000],
    ["1 250 000", 1_250_000],
    ["1,250,000.50", 1_250_000.5],
    ["1.250.000,50", 1_250_000.5],
    ["AED 2,450,000", 2_450_000],
    ["2.5", 2.5],
    ["1,5", 1.5],
    ["45%", 45],
    ["0", 0],
  ])("reads %s", (raw, expected) => {
    expect(parseNumber(raw)).toBe(expected);
  });

  it.each(["", "abc", "1,23,4", "5-6", "1.2.3"])("refuses %j", (raw) => {
    expect(parseNumber(raw)).toBeNull();
  });

  it("reads k and M amounts", () => {
    expect(parseMoney("2.45M")).toBe(2_450_000);
    expect(parseMoney("850k")).toBe(850_000);
    expect(parseMoney("1,200")).toBe(1200);
  });

  it("reads yes/no", () => {
    expect([
      parseBoolean("Yes"),
      parseBoolean("x"),
      parseBoolean("0"),
      parseBoolean("maybe"),
    ]).toEqual([true, true, false, null]);
  });

  it("reads dates in the market's order and refuses impossible ones", () => {
    expect(parseDate("2027-06-30", "dmy")).toBe("2027-06-30");
    expect(parseDate("30/06/2027", "dmy")).toBe("2027-06-30");
    expect(parseDate("06/30/2027", "mdy")).toBe("2027-06-30");
    expect(parseDate("31/02/2027", "dmy")).toBeNull();
    expect(parseDate("next year", "dmy")).toBeNull();
  });

  it("reads a handover as a date, a quarter or a month", () => {
    expect(parseHandover("q4 2027", "dmy")).toEqual({ date: null, text: "Q4 2027" });
    expect(parseHandover("2027-Q1", "dmy")).toEqual({ date: null, text: "Q1 2027" });
    expect(parseHandover("December 2027", "dmy")).toEqual({ date: null, text: "December 2027" });
    expect(parseHandover("31/12/2027", "dmy")).toEqual({ date: "2027-12-31", text: "" });
    expect(parseHandover("soon", "dmy")).toBeNull();
  });

  it("turns plain text into paragraphs and line breaks", () => {
    expect(textToDoc("First line\nsame paragraph\n\nSecond")).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "First line" },
            { type: "hardBreak" },
            { type: "text", text: "same paragraph" },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "Second" }] },
      ],
    });
    expect(textToDoc("  \n ")).toBeNull();
  });
});

describe("columns", () => {
  it("matches headers by name, label and alias, each field once, the market unit first", () => {
    expect(
      autoMap(
        [
          "Title",
          "Property Type",
          "Community",
          "Asking Price",
          "Bedrooms",
          "Size",
          "BUA (sq m)",
          "Photos",
          "Notes",
          "title",
        ],
        "sqft",
      ),
    ).toEqual([
      "title",
      "property_type",
      "location",
      "price",
      "beds",
      "size_sqft",
      null,
      "photo_urls",
      null,
      null,
    ]);
    expect(autoMap(["size", "Plot Size (m²)"], "sqm")).toEqual(["size_sqm", "plot_size_sqm"]);
  });

  it("needs purpose and type, and each field once", () => {
    const cols: Array<FieldKey | null> = ["title", "title", "size_sqft", "size_sqm"];
    expect(mappingProblems(cols)).toEqual([
      "“Title” is chosen for two columns.",
      "Choose the column for “Purpose”.",
      "Choose the column for “Property type”.",
      "Choose one size column (sq ft or m²).",
    ]);
    expect(mappingProblems(["purpose", "property_type", "reference"])).toEqual([
      "“Reference” cannot be imported.",
    ]);
  });

  it("builds the template in the market's unit", () => {
    const keys = templateFields("sqm").map((x) => x.key);
    expect(keys).toContain("size_sqm");
    expect(keys).not.toContain("size_sqft");
    expect(keys).not.toContain("reference");
    expect(keys.slice(0, 4)).toEqual(["title", "purpose", "completion", "property_type"]);
    expect(templateFields("sqft", { exportOnly: true }).map((x) => x.key)).toContain("reference");
  });
});

describe("row checks", () => {
  it("makes a draft in stored units", () => {
    const res = row({
      title: "Marina view",
      purpose: "Rent",
      completion: "Off plan",
      type: "apartments",
      area: "dubai-marina",
      price: "AED 185,000",
      bedrooms: "Studio",
      baths: "1",
      size_sqft: "1,000",
      "service charge per sq ft": "15.50",
      furnishing: "semi furnished",
      view: "Sea, Marina",
      facilities: "Pool | Gym | Sauna",
      agent: "SARA@agency.example",
      handover: "Q4 2027",
      description: "Bright unit.\n\nNear the metro.",
      photo_urls: "https://cdn.example/a.jpg | not-a-url | https://cdn.example/b.jpg",
      maid_room: "yes",
      coordinates: "25.0805, 55.1403",
    });
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([
      "Facilities not set up, left out: Sauna.",
      "Photo addresses that are not web links were left out: 1.",
    ]);
    expect(res.draft).toMatchObject({
      title: "Marina view",
      purpose: "rent",
      completion: "off_plan",
      propertyTypeId: "t-apt",
      locationId: "l-marina",
      price: 18_500_000,
      currency: "AED",
      pricePeriod: "year",
      beds: 0,
      baths: 1,
      furnishing: "Semi-furnished",
      view: ["Sea", "Marina"],
      facilityIds: ["f-pool", "f-gym"],
      agentId: "a-sara",
      handoverDate: null,
      handoverText: "Q4 2027",
      maidRoom: true,
      point: { lat: 25.0805, lng: 55.1403 },
      photoUrls: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
    });
    expect(res.draft!.size).toBeCloseTo(92.903, 3);
    // AED 15.50 per sq ft = 1550 fils per sq ft = about 16,684 fils per m².
    expect(res.draft!.serviceChargePerArea).toBe(16_684);
    expect(res.draft!.description!.content).toHaveLength(2);
  });

  it("reports every problem in a row", () => {
    const res = row({
      purpose: "auction",
      type: "Castle",
      location: "The Hills",
      price: "lots",
      beds: "2.5",
      latitude: "25.1",
      currency: "GBP",
      video_url: "javascript:alert(1)",
      year_built: "1700",
    });
    expect(res.draft).toBeNull();
    expect(res.errors).toEqual([
      "Purpose “auction” is not sale or rent.",
      "Property type “Castle” is not set up (Setup -> Property types).",
      "Location “The Hills” matches 2 locations (in Dubai, in Ajman). Use the slug, e.g. the-hills-dubai.",
      "Give both latitude and longitude, or neither.",
      "Currency “GBP” is not set up in Settings -> Market.",
      "Price “lots” is not an amount.",
      "Bedrooms “2.5” should be a whole number from 0 to 50.",
      "Year built “1700” should be a year from 1800 to " + (new Date().getFullYear() + 10) + ".",
      "Video URL must start with https://.",
    ]);
  });

  it("only purpose and type are required; turned-off agents are left unassigned", () => {
    const res = row({ purpose: "sale", type: "Villa", agent: "Omar Old", rent_period: "monthly" });
    expect(res.errors).toEqual([]);
    expect(res.draft).toMatchObject({
      propertyTypeId: "t-villa",
      agentId: null,
      pricePeriod: null,
    });
    expect(res.warnings).toEqual([
      "Rent period is ignored for a sale.",
      "Agent “Omar Old” is turned off; left unassigned.",
      "No title yet: add one in the editor.",
    ]);
    expect(row({ title: "No purpose", type: "Villa" }).errors).toEqual([
      "Purpose is missing (sale or rent).",
    ]);
  });

  it("uses each currency's decimals", () => {
    expect(
      row({ purpose: "sale", type: "Villa", price: "15000000", currency: "jpy" }).draft,
    ).toMatchObject({ price: 15_000_000, currency: "JPY" });
  });
});
