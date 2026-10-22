import { describe, expect, it } from "vitest";
import { savedSearchFilters } from "@/features/alerts/filters";

describe("saved search filters (12 §2)", () => {
  it("reads the search URL's shape with the search page's rules", () => {
    const f = savedSearchFilters(
      {
        purpose: "rent",
        loc: ["dubai-marina", "Bad Slug!"],
        beds: ["2", "studio", "9"],
        max: "120000",
        q: "sea view",
      },
      null,
    );
    expect(f).toMatchObject({
      purpose: "rent",
      loc: ["dubai-marina"],
      beds: [0, 2],
      max: 120000,
      q: "sea view",
      sort: "newest",
      page: 1,
      poly: null,
    });
    // Comma lists and numbers work too; objects are ignored.
    expect(savedSearchFilters({ loc: "a,b", min: 5, junk: { x: 1 } }, null)).toMatchObject({
      loc: ["a", "b"],
      min: 5,
    });
    expect(savedSearchFilters(null, null).purpose).toBe("sale");
  });

  it("takes the drawn area from its column, without the closing point", () => {
    const f = savedSearchFilters(
      {},
      {
        type: "Polygon",
        coordinates: [
          [
            [55, 25],
            [55.1, 25],
            [55.1, 25.1],
            [55, 25],
          ],
        ],
      },
    );
    expect(f.poly).toEqual([
      [55, 25],
      [55.1, 25],
      [55.1, 25.1],
    ]);
    // A filters object may carry the ring itself.
    expect(
      savedSearchFilters(
        {
          poly: [
            [1, 1],
            [2, 1],
            [2, 2],
          ],
        },
        null,
      ).poly,
    ).toEqual([
      [1, 1],
      [2, 1],
      [2, 2],
    ]);
  });
});
