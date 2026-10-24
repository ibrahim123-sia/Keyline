import { describe, expect, it } from "vitest";
import { monthOf, previousMonth } from "@/features/price-trends/compute";
import { monthsBetween, summarise, type StatPoint } from "@/features/price-trends/series";

const point = (period: string, value: number, over: Partial<StatPoint> = {}): StatPoint => ({
  period,
  source: "agency_data",
  value,
  listingsCount: 10,
  avgDaysOnMarket: null,
  sourceNote: null,
  ...over,
});

const months = (from: string, n: number) => {
  const [y, m] = from.split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 10),
  );
};

describe("price trend series", () => {
  it("counts months", () => {
    expect(monthsBetween("2025-09-01", "2026-09-01")).toBe(12);
    expect(previousMonth("2026-01-01")).toBe("2025-12-01");
    expect(monthOf("2026-10-24")).toBe("2026-10-01");
  });

  it("needs 5 figures before it shows a trend", () => {
    const four = months("2026-05-01", 4).map((p) => point(p, 100));
    expect(summarise(four)).toMatchObject({ series: [], primary: null, change12m: null });
    const five = months("2026-05-01", 5).map((p) => point(p, 100));
    expect(summarise(five).series).toHaveLength(1);
  });

  it("works out the change vs 12 months ago, listings and days on market", () => {
    const pts = months("2025-09-01", 13).map((p, i) =>
      point(p, 1000 + i * 10, { listingsCount: 20 + i, avgDaysOnMarket: i < 12 ? 40 + i : null }),
    );
    const s = summarise(pts);
    expect(s.latest?.period).toBe("2026-09-01");
    expect(s.change12m).toBeCloseTo(0.12, 5);
    expect(s.listingsCount).toBe(32);
    // The latest month had no deal: the last known average.
    expect(s.avgDaysOnMarket).toBe(51);
  });

  it("keeps sources apart, agency data first, with their notes", () => {
    const pts = [
      ...months("2025-01-01", 6).map((p) =>
        point(p, 900, { source: "admin_entered", sourceNote: "Market report Q1" }),
      ),
      ...months("2026-04-01", 6).map((p) => point(p, 1000)),
    ];
    const s = summarise(pts);
    expect(s.series.map((x) => x.source)).toEqual(["agency_data", "admin_entered"]);
    expect(s.series[1]!.notes).toEqual(["Market report Q1"]);
    expect(s.primary?.source).toBe("agency_data");
  });

  it("counts the 5 figures across sources; a line needs 2", () => {
    const pts = [
      ...months("2025-10-01", 4).map((p) => point(p, 900, { source: "admin_entered" })),
      ...months("2026-02-01", 2).map((p) => point(p, 1000)),
    ];
    const s = summarise(pts);
    expect(s.series.map((x) => x.points.length)).toEqual([2, 4]);
    // The longest series gives the numbers while agency data is short.
    expect(s.primary?.source).toBe("admin_entered");
    expect(summarise([...pts.slice(0, 3), pts[4]!]).series).toEqual([]);
  });

  it("only shows the last 24 months before the latest figure", () => {
    const pts = months("2023-01-01", 40).map((p) => point(p, 100));
    const s = summarise(pts);
    expect(s.series[0]!.points).toHaveLength(24);
    expect(s.series[0]!.points[0]!.period).toBe("2024-05-01");
  });
});
