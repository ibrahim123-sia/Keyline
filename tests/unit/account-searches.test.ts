import { describe, expect, it } from "vitest";
import {
  filtersSummary,
  filtersToStored,
  polygonOf,
  storedToFilters,
} from "@/features/account/searches";
import { emptyLabels } from "@/features/search/labels";
import { parseSearch } from "@/features/search/params";

const units = {
  currency: { code: "AED", symbol: "AED", symbolPosition: "before" as const, decimals: 2 },
  areaUnit: "sqft" as const,
};

describe("saved search filters", () => {
  it("are stored as URL parameters and read back the same, without paging or sort", () => {
    const f = parseSearch(
      new URLSearchParams(
        "purpose=rent&loc=dubai-marina&type=apartments&beds=2&beds=3&max=150000&sort=price_asc&page=3",
      ),
    );
    const stored = filtersToStored(f);
    expect(stored).toEqual({
      purpose: "rent",
      loc: "dubai-marina",
      type: "apartments",
      max: "150000",
      beds: ["2", "3"],
    });
    expect(storedToFilters(stored)).toEqual({ ...f, sort: "newest", page: 1 });
  });

  it("keep a drawn area as a closed polygon", () => {
    const f = parseSearch(new URLSearchParams());
    expect(polygonOf(f)).toBeNull();
    const ring: Array<[number, number]> = [
      [55.1, 25.0],
      [55.2, 25.0],
      [55.2, 25.1],
    ];
    expect(polygonOf({ ...f, poly: ring })).toEqual({
      type: "Polygon",
      coordinates: [[...ring, ring[0]]],
    });
  });

  it("read as a short summary", () => {
    const f = parseSearch(new URLSearchParams("loc=dubai-marina&beds=2&max=2000000"));
    const labels = { ...emptyLabels(), places: { "dubai-marina": "Dubai Marina" } };
    const text = filtersSummary(f, labels, units);
    expect(text.startsWith("Homes for sale in Dubai Marina")).toBe(true);
    expect(text).toContain(" · ");
  });
});
