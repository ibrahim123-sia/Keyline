import { describe, expect, it } from "vitest";
import {
  clearedSearch,
  compactMoney,
  countText,
  emptyLabels,
  pluralType,
  searchChips,
  searchHeading,
  showingText,
  type SearchLabels,
} from "@/features/search/labels";
import { parseSearch, searchHref } from "@/features/search/params";

const aed = { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 } as const;
const units = { currency: aed, areaUnit: "sqft" as const };
const labels: SearchLabels = {
  ...emptyLabels(),
  places: { "dubai-marina": "Dubai Marina", jbr: "JBR", "p.the-linden": "The Linden" },
  types: { apartments: "Apartment", villas: "Villa", penthouses: "Penthouse", offices: "Office" },
  facilities: { "01a15a6f-4d91-71e8-b8e1-9b6e108751d1": "Pool" },
  agent: "Sara Khan",
};

describe("search headings", () => {
  it("names the type, the purpose and the place", () => {
    expect(searchHeading(parseSearch({}, { purpose: "sale" }), labels)).toBe("Homes for sale");
    expect(searchHeading(parseSearch({}, { purpose: "rent" }), labels)).toBe("Homes for rent");
    expect(
      searchHeading(
        parseSearch({}, { purpose: "sale", loc: ["dubai-marina"], type: ["apartments"] }),
        labels,
      ),
    ).toBe("Apartments for sale in Dubai Marina");
    expect(
      searchHeading(parseSearch({ loc: ["dubai-marina", "jbr"] }, { purpose: "rent" }), labels),
    ).toBe("Homes for rent in Dubai Marina and JBR");
    expect(
      searchHeading(parseSearch({ loc: ["dubai-marina", "jbr", "p.the-linden"] }), labels),
    ).toBe("Homes for sale in Dubai Marina and 2 more areas");
    expect(
      searchHeading(
        parseSearch({ loc: "p.the-linden" }, { purpose: "sale", completion: "off_plan" }),
        labels,
      ),
    ).toBe("Off-plan homes in The Linden");
    expect(
      searchHeading(
        parseSearch({ type: "villas" }, { purpose: "sale", completion: "off_plan" }),
        labels,
      ),
    ).toBe("Off-plan villas");
    expect(
      searchHeading(
        parseSearch({ poly: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" }, { purpose: "sale" }),
        labels,
      ),
    ).toBe("Homes for sale in your drawn area");
  });

  it("makes plural type names", () => {
    expect(
      ["Apartment", "Penthouse", "Townhouse", "Office", "Box", "Duplex", "Property"].map(
        pluralType,
      ),
    ).toEqual([
      "Apartments",
      "Penthouses",
      "Townhouses",
      "Offices",
      "Boxes",
      "Duplexes",
      "Properties",
    ]);
  });

  it("counts and shows ranges", () => {
    expect([0, 1, 1234].map(countText)).toEqual(["No homes", "1 home", "1,234 homes"]);
    expect(showingText(45, 3)).toBe("Showing 41–45 of 45");
    expect(compactMoney(1_500_000, aed)).toBe("AED 1.5M");
    expect(
      compactMoney(750_000, { code: "USD", symbol: "$", symbolPosition: "before", decimals: 2 }),
    ).toBe("$750K");
  });
});

describe("filter chips", () => {
  it("one chip per filter beyond the route, each removing only itself", () => {
    const f = parseSearch(
      {
        beds: ["studio", "2"],
        min: "1000000",
        max: "3000000",
        fac: "01a15a6f-4d91-71e8-b8e1-9b6e108751d1",
        badge: "verified",
        agent: "sara-khan",
        q: "sea view",
      },
      { purpose: "sale", loc: ["dubai-marina"] },
    );
    const chips = searchChips(f, labels, units);
    expect(chips.map((c) => c.label)).toEqual([
      "AED 1M – AED 3M",
      "Studio, 2 beds",
      "Pool",
      "Verified listings",
      "“sea view”",
      "Agent: Sara Khan",
    ]);
    const withoutBeds = chips.find((c) => c.key === "beds")!.remove(f);
    expect(searchHref(withoutBeds)).toBe(
      "/buy/dubai-marina?min=1000000&max=3000000&fac=01a15a6f-4d91-71e8-b8e1-9b6e108751d1&badge=verified&q=sea+view&agent=sara-khan",
    );
    // Clear all keeps the landing route.
    expect(searchHref(clearedSearch(f, labels, units))).toBe("/buy/dubai-marina");
  });

  it("shows places and types as chips once they are not the route itself", () => {
    const f = parseSearch({ loc: ["dubai-marina", "jbr"], type: "villas", sort: "price_asc" });
    const chips = searchChips(f, labels, units);
    expect(chips.map((c) => c.label)).toEqual(["Dubai Marina", "JBR", "Villas"]);
    expect(searchHref(chips[1]!.remove(f))).toBe("/buy/dubai-marina/villas?sort=price_asc");
  });
});
