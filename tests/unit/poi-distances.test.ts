import { describe, expect, it } from "vitest";
import {
  batches,
  closestPerType,
  needsWalk,
  planPoiRows,
  samePoint,
} from "@/features/pois/distance-rules";

const c = (poiId: string, poiTypeId: string, straightDistanceM: number) => ({
  poiId,
  poiTypeId,
  straightDistanceM,
});

describe("closest places per type", () => {
  it("keeps the three nearest of each type, nearest first, without duplicates", () => {
    const picked = closestPerType([
      c("s4", "school", 900),
      c("s1", "school", 100),
      c("m1", "metro", 400),
      c("s3", "school", 700),
      c("s2", "school", 300),
      c("s1", "school", 100),
    ]);
    expect(picked.map((p) => p.poiId)).toEqual(["s1", "s2", "s3", "m1"]);
  });

  it("breaks ties by id so repeated runs agree", () => {
    expect(closestPerType([c("b", "t", 50), c("a", "t", 50)], 1).map((p) => p.poiId)).toEqual([
      "a",
    ]);
  });
});

describe("walking times", () => {
  it("are asked for walking types and for places under 1.5 km", () => {
    expect(needsWalk({ travelMode: "walk", straightDistanceM: 4000 })).toBe(true);
    expect(needsWalk({ travelMode: "drive", straightDistanceM: 1499 })).toBe(true);
    expect(needsWalk({ travelMode: "drive", straightDistanceM: 1500 })).toBe(false);
  });

  it("splits destinations into batches for Google Routes", () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batches([], 25)).toEqual([]);
  });
});

describe("merging a new measurement", () => {
  const order = new Map([
    ["school", 1],
    ["metro", 2],
  ]);

  it("orders a first measurement by type, then distance", () => {
    const plan = planPoiRows(
      [],
      [c("m1", "metro", 100), c("s2", "school", 500), c("s1", "school", 200)],
      order,
    );
    expect(plan).toEqual({
      upserts: [
        { poiId: "s1", sortOrder: 0 },
        { poiId: "s2", sortOrder: 1 },
        { poiId: "m1", sortOrder: 2 },
      ],
      deletes: [],
    });
  });

  it("keeps stored order, adds new places after it and drops places out of range", () => {
    const plan = planPoiRows(
      [
        { poiId: "s1", sortOrder: 4, isManualOverride: false },
        { poiId: "s2", sortOrder: 0, isManualOverride: false },
        { poiId: "s3", sortOrder: 1, isManualOverride: true },
      ],
      [c("s1", "school", 200), c("s9", "school", 50), c("m1", "metro", 10)],
      order,
    );
    expect(plan.upserts).toEqual([
      { poiId: "s1", sortOrder: null },
      { poiId: "s9", sortOrder: 5 },
      { poiId: "m1", sortOrder: 6 },
    ]);
    // s2 left the range; s3 did too, but the admin wrote its text, so it stays.
    expect(plan.deletes).toEqual(["s2"]);
  });
});

describe("pins", () => {
  it("compare equal through float noise", () => {
    expect(samePoint({ lng: 55.14, lat: 25.08 }, { lng: 55.14 + 1e-12, lat: 25.08 })).toBe(true);
    expect(samePoint({ lng: 55.14, lat: 25.08 }, { lng: 55.1401, lat: 25.08 })).toBe(false);
    expect(samePoint(null, null)).toBe(true);
    expect(samePoint(null, { lng: 0, lat: 0 })).toBe(false);
  });
});
