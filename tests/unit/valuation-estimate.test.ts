import { describe, expect, it } from "vitest";
import {
  estimateValuation,
  findComparables,
  median,
  quantile,
  sizeWithin,
  valuationRules,
  type ComparableCandidate,
  type ValuationSubject,
} from "@/features/valuation/estimate";

const subject: ValuationSubject = {
  purpose: "sale",
  propertyTypeId: "apt",
  areaLocationIds: ["marina", "marina-gate"],
  beds: 2,
  size: 100,
};

let n = 0;
const listing = (over: Partial<ComparableCandidate> = {}): ComparableCandidate => ({
  id: `p${String(++n).padStart(3, "0")}`,
  purpose: "sale",
  propertyTypeId: "apt",
  locationId: "marina",
  beds: 2,
  size: 100,
  price: 200_000_000, // AED 2,000,000 in fils
  ...over,
});

describe("quantiles", () => {
  it("interpolates between neighbours", () => {
    expect(quantile([10, 20, 30, 40], 0.25)).toBe(17.5);
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(quantile([10, 20, 30, 40], 0.75)).toBe(32.5);
    expect(median([5])).toBe(5);
    expect(quantile([1, 2, 3], 0)).toBe(1);
    expect(quantile([1, 2, 3], 1)).toBe(3);
  });

  it("refuses an empty list", () => {
    expect(() => quantile([], 0.5)).toThrow();
  });
});

describe("comparables (same area, type and beds; size within ±20%)", () => {
  it("keeps only listings that match every rule", () => {
    const keep = [
      listing({ id: "same" }),
      listing({ id: "inside-area", locationId: "marina-gate" }),
      listing({ id: "edge-small", size: 80 }),
      listing({ id: "edge-large", size: 120 }),
    ];
    const drop = [
      listing({ id: "rent", purpose: "rent" }),
      listing({ id: "villa", propertyTypeId: "villa" }),
      listing({ id: "elsewhere", locationId: "downtown" }),
      listing({ id: "no-location", locationId: null }),
      listing({ id: "three-beds", beds: 3 }),
      listing({ id: "too-small", size: 79.9 }),
      listing({ id: "too-large", size: 120.1 }),
      listing({ id: "no-price", price: null }),
      listing({ id: "no-size", size: null }),
      listing({ id: "zero-price", price: 0 }),
    ];
    const found = findComparables(subject, [...drop, ...keep]);
    expect(found.map((c) => c.id).sort()).toEqual(keep.map((c) => c.id).sort());
    expect(found.find((c) => c.id === "same")?.pricePerSqm).toBe(2_000_000);
  });

  it("treats a studio as 0 bedrooms and types without bedrooms as null", () => {
    const studio = { ...subject, beds: 0 };
    expect(
      findComparables(studio, [listing({ id: "s", beds: 0 }), listing({ id: "x", beds: null })]),
    ).toHaveLength(1);
    const office = { ...subject, beds: null };
    expect(
      findComparables(office, [
        listing({ id: "o", beds: null }),
        listing({ id: "x", beds: 0 }),
      ]).map((c) => c.id),
    ).toEqual(["o"]);
  });

  it("uses the 10 closest in size when there are more", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      listing({ id: `m${String(i).padStart(2, "0")}`, size: 100 + (i - 7) * 2 }),
    );
    const found = findComparables(subject, many);
    expect(found).toHaveLength(valuationRules.maxComparables);
    expect(Math.max(...found.map((c) => Math.abs(c.size - 100)))).toBeLessThanOrEqual(10);
    expect(found[0]!.size).toBe(100);
  });

  it("checks size bounds inclusively", () => {
    expect(sizeWithin(100, 80, 0.2)).toBe(true);
    expect(sizeWithin(100, 120, 0.2)).toBe(true);
    expect(sizeWithin(100, 121, 0.2)).toBe(false);
  });
});

describe("estimate", () => {
  it("gives quartiles of the price per m² times the size, rounded to three figures", () => {
    // Prices per m²: 18,000 · 20,000 · 22,000 · 24,000 AED (in fils).
    const comps = [
      listing({ size: 100, price: 180_000_000 }),
      listing({ size: 110, price: 220_000_000 }),
      listing({ size: 90, price: 198_000_000 }),
      listing({ size: 105, price: 252_000_000 }),
    ];
    const home = { ...subject, size: 101 };
    const result = estimateValuation(home, comps, { decimals: 2 });
    expect(result.status).toBe("estimate");
    if (result.status !== "estimate") return;
    expect(result.perSqm).toEqual({ low: 1_950_000, median: 2_100_000, high: 2_250_000 });
    // 19,500 × 101 = 1,969,500 → 1,970,000; 21,000 × 101 = 2,121,000 → 2,120,000;
    // 22,500 × 101 = 2,272,500 → 2,270,000.
    expect([result.low, result.mid, result.high]).toEqual([197_000_000, 212_000_000, 227_000_000]);
    expect(result.comparables).toHaveLength(4);
    expect(result.low).toBeLessThanOrEqual(result.mid);
    expect(result.mid).toBeLessThanOrEqual(result.high);
  });

  it("gives no number with fewer than 3 comparables", () => {
    const result = estimateValuation(subject, [listing(), listing(), listing({ beds: 3 })], {
      decimals: 2,
    });
    expect(result).toEqual({ status: "not_enough_data", comparables: expect.any(Array) });
    expect(result.comparables).toHaveLength(2);
  });

  it("works with exactly 3 comparables, and with currencies without decimals", () => {
    const comps = [
      listing({ price: 1_000_000 }),
      listing({ price: 1_200_000 }),
      listing({ price: 1_400_000 }),
    ];
    const result = estimateValuation(subject, comps, { decimals: 0 });
    expect(result).toMatchObject({ status: "estimate", low: 1_100_000, mid: 1_200_000 });
    if (result.status === "estimate") expect(result.high).toBe(1_300_000);
  });

  it("rents compare with rents only", () => {
    const rent = { ...subject, purpose: "rent" as const };
    const comps = [
      listing({ purpose: "rent", price: 10_000_000 }),
      listing({ purpose: "rent", price: 11_000_000 }),
      listing({ purpose: "rent", price: 12_000_000 }),
      listing({ purpose: "sale", price: 900_000_000 }),
    ];
    const result = estimateValuation(rent, comps, { decimals: 2 });
    expect(result.status).toBe("estimate");
    if (result.status === "estimate") {
      expect(result.comparables.every((c) => c.purpose === "rent")).toBe(true);
      expect(result.mid).toBe(11_000_000);
    }
  });
});
