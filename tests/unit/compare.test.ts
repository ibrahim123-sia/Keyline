import { describe, expect, it } from "vitest";
import {
  bestIndexes,
  compareHighlights,
  comparePath,
  grossYield,
  parseCompareIds,
  type CompareNumbers,
} from "@/features/compare/best";

const row = (n: Partial<CompareNumbers>): CompareNumbers => ({
  pricePerArea: null,
  serviceCharge: null,
  yield: null,
  school: null,
  transport: null,
  shopping: null,
  ...n,
});

describe("compare: best value per row (11 §3)", () => {
  it("picks the lowest or highest value, every one when tied", () => {
    expect(bestIndexes([300, 250, 400], "min")).toEqual([1]);
    expect(bestIndexes([5.1, 6.4, 6.4], "max")).toEqual([1, 2]);
    expect(bestIndexes([null, 900, 1200, null], "min")).toEqual([1]);
  });

  it("highlights nothing without a real choice", () => {
    expect(bestIndexes([], "min")).toEqual([]);
    expect(bestIndexes([null, 500], "min")).toEqual([]); // one value only
    expect(bestIndexes([700, 700, null], "min")).toEqual([]); // all the same
    expect(bestIndexes([Number.NaN, 3], "max")).toEqual([]);
  });

  it("lowest price per area, lowest service charge, highest yield, nearest places", () => {
    const items = [
      row({ pricePerArea: 20_000, serviceCharge: 1500, yield: 5.2, school: 800, transport: 300 }),
      row({ pricePerArea: 17_500, serviceCharge: 1800, yield: 6.8, school: 1200, shopping: 900 }),
      row({ pricePerArea: 21_000, yield: null, school: 450, transport: 300, shopping: 2000 }),
    ];
    expect(compareHighlights(items)).toEqual({
      pricePerArea: [1],
      serviceCharge: [0],
      yield: [1],
      school: [2],
      transport: [],
      shopping: [1],
    });
  });

  it("gross yield is yearly rent over price, one decimal", () => {
    expect(grossYield(200_000_000, 13_000_000)).toBe(6.5);
    expect(grossYield(300_000_000, 10_000_000)).toBe(3.3);
    expect(grossYield(null, 10)).toBeNull();
    expect(grossYield(100, 0)).toBeNull();
  });

  it("share links carry up to four valid ids, without repeats", () => {
    const a = "0192f000-0000-7000-8000-00000000000a";
    const b = "0192F000-0000-7000-8000-00000000000B";
    const ids = parseCompareIds(`${a}, ${b},nope,${a},'; drop table x;--`);
    expect(ids).toEqual([a, b.toLowerCase()]);
    expect(parseCompareIds([a, b])).toEqual([a, b.toLowerCase()]);
    expect(parseCompareIds(undefined)).toEqual([]);
    const five = Array.from({ length: 5 }, (_, i) => `0192f000-0000-7000-8000-00000000000${i}`);
    expect(parseCompareIds(five.join(","))).toHaveLength(4);
    expect(comparePath([a, b])).toBe(`/tools/compare?ids=${a},${b}`);
  });
});
