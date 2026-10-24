import { describe, expect, it } from "vitest";
import { formatChange, formatValue, csvValue } from "@/features/reports/format";
import { STEP, funnelCounts, reachedStep, stageStepRanks } from "@/features/reports/funnel-steps";
import {
  addDays,
  compare,
  eachDay,
  parsePeriodParams,
  rate,
  resolvePeriod,
  utcBounds,
} from "@/features/reports/period";
import { bucketOf } from "@/features/reports/response-time";
import { bucketTrend } from "@/features/reports/overview";
import { localWeekdayHour, weeklyReportDue, weeklyReportPeriod } from "@/features/reports/weekly";

const today = "2026-10-24";
const resolve = (period: string, from?: string, to?: string) =>
  resolvePeriod(parsePeriodParams({ period, from, to }), today);

describe("report periods (09 §7 by period with comparison)", () => {
  it("rolling presets end today and compare with the same number of days before", () => {
    expect(resolve("7d")).toMatchObject({
      from: "2026-10-18",
      to: "2026-10-24",
      days: 7,
      previous: { from: "2026-10-11", to: "2026-10-17" },
    });
    expect(resolve("30d")).toMatchObject({
      from: "2026-09-25",
      days: 30,
      previous: { from: "2026-08-26", to: "2026-09-24" },
    });
    expect(resolve("90d").days).toBe(90);
    // Unknown values fall back to 30 days.
    expect(resolve("nonsense").preset).toBe("30d");
  });

  it("months compare with the same days of last month, kept inside short months", () => {
    expect(resolve("month")).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-24",
      previous: { from: "2026-09-01", to: "2026-09-24" },
    });
    expect(resolve("lastMonth")).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
      days: 30,
      previous: { from: "2026-08-01", to: "2026-08-31" },
    });
    // 31 March: this month so far vs 1-28 February (not 3 March).
    const march = resolvePeriod({ period: "month", from: null, to: null }, "2026-03-31");
    expect(march.previous).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    // Last month in January is December of the year before.
    const jan = resolvePeriod({ period: "lastMonth", from: null, to: null }, "2027-01-10");
    expect(jan).toMatchObject({ from: "2026-12-01", to: "2026-12-31" });
    expect(jan.previous).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });

  it("year to date compares with the same dates a year earlier (29 Feb safe)", () => {
    expect(resolve("ytd")).toMatchObject({
      from: "2026-01-01",
      to: "2026-10-24",
      previous: { from: "2025-01-01", to: "2025-10-24" },
    });
    const leap = resolvePeriod({ period: "ytd", from: null, to: null }, "2028-02-29");
    expect(leap.previous).toEqual({ from: "2027-01-01", to: "2027-02-28" });
  });

  it("custom dates are ordered, capped at today and 731 days, and compared with the days before", () => {
    expect(resolve("custom", "2026-10-10", "2026-10-01")).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-10",
      days: 10,
      previous: { from: "2026-09-21", to: "2026-09-30" },
    });
    expect(resolve("custom", "2026-10-20", "2027-01-01")).toMatchObject({
      from: "2026-10-20",
      to: today,
    });
    expect(resolve("custom", "2010-01-01", "2026-10-24").days).toBe(731);
    // Missing dates: back to 30 days.
    expect(resolve("custom", "2026-10-01").preset).toBe("30d");
    expect(resolve("custom", "bad", "2026-10-01").preset).toBe("30d");
  });

  it("local days become instant bounds in the time zone, across daylight saving", () => {
    expect(utcBounds({ from: "2026-10-01", to: "2026-10-31" }, "Asia/Dubai")).toEqual({
      start: "2026-09-30T20:00:00.000Z",
      end: "2026-10-31T20:00:00.000Z",
    });
    // New York: EDT (UTC-4) on 1 Nov 2026 at midnight, EST (UTC-5) from 2 Nov.
    expect(utcBounds({ from: "2026-11-01", to: "2026-11-01" }, "America/New_York")).toEqual({
      start: "2026-11-01T04:00:00.000Z",
      end: "2026-11-02T05:00:00.000Z",
    });
    expect(eachDay({ from: "2026-02-27", to: "2026-03-02" })).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("changes, rates and their wording", () => {
    expect(compare(12, 10)).toEqual({ delta: 2, ratio: 0.2, direction: "up" });
    expect(compare(5, 0)).toEqual({ delta: 5, ratio: null, direction: "up" });
    expect(compare(3, 3).direction).toBe("same");
    expect(rate(1, 4)).toBe(0.25);
    expect(rate(3, 0)).toBe(0);
    const aed = { code: "AED", symbol: "AED", symbolPosition: "before" as const, decimals: 2 };
    expect(formatChange(compare(12, 10), "int", aed)).toBe("+20%");
    expect(formatChange(compare(8, 10), "int", aed)).toBe("-20%");
    expect(formatChange(compare(5, 0), "int", aed)).toBe("new");
    expect(formatChange(compare(0.3, 0.25), "percent", aed)).toBe("+5 pts");
    expect(formatChange(compare(600, 900), "duration", aed)).toBe("-5 min");
    expect(formatValue(150_000_00, "money", aed)).toBe("AED 150,000");
    expect(formatValue(null, "int", aed)).toBe("–");
    expect(csvValue(150_000_00, "money", aed)).toBe("150000.00");
    expect(csvValue(0.125, "percent", aed)).toBe(12.5);
    expect(csvValue(90, "duration", aed)).toBe(1.5);
  });
});

describe("funnel mapping (lead -> contacted -> viewing -> offer -> won)", () => {
  const stage = (id: string, kind: "open" | "won" | "lost", sortOrder: number) => ({
    id,
    kind,
    sortOrder,
  });

  it("maps the default pipeline one to one, by kind and order rather than name", () => {
    const ranks = stageStepRanks([
      stage("lost", "lost", 5),
      stage("offer", "open", 3),
      stage("new", "open", 0),
      stage("viewing", "open", 2),
      stage("contacted", "open", 1),
      stage("won", "won", 4),
    ]);
    expect(Object.fromEntries(ranks)).toEqual({
      new: STEP.lead,
      contacted: STEP.contacted,
      viewing: STEP.viewing,
      offer: STEP.offer,
      won: STEP.won,
    });
  });

  it("short and long pipelines: last open stage is the offer from three open stages", () => {
    const two = stageStepRanks([stage("a", "open", 0), stage("b", "open", 1)]);
    expect([two.get("a"), two.get("b")]).toEqual([STEP.lead, STEP.contacted]);
    const three = stageStepRanks([
      stage("a", "open", 0),
      stage("b", "open", 1),
      stage("c", "open", 2),
    ]);
    expect([...three.values()]).toEqual([STEP.lead, STEP.contacted, STEP.offer]);
    const six = stageStepRanks(["a", "b", "c", "d", "e", "f"].map((id, i) => stage(id, "open", i)));
    expect([...six.values()]).toEqual([
      STEP.lead,
      STEP.contacted,
      STEP.viewing,
      STEP.viewing,
      STEP.viewing,
      STEP.offer,
    ]);
  });

  it("a lead reaches the furthest step any evidence shows; counts are cumulative", () => {
    const none = { stageRanks: [], answered: false, hasViewing: false, won: false };
    expect(reachedStep(none)).toBe(STEP.lead);
    expect(reachedStep({ ...none, answered: true })).toBe(STEP.contacted);
    expect(reachedStep({ ...none, answered: true, hasViewing: true })).toBe(STEP.viewing);
    // Lost after an offer: the stage history keeps the offer.
    expect(reachedStep({ ...none, stageRanks: [undefined, STEP.offer] })).toBe(STEP.offer);
    expect(reachedStep({ ...none, won: true })).toBe(STEP.won);
    expect(funnelCounts([0, 1, 2, 4, 4, 3])).toEqual({
      lead: 6,
      contacted: 5,
      viewing: 4,
      offer: 3,
      won: 2,
    });
  });
});

describe("response time buckets and trends", () => {
  it("puts first replies into buckets", () => {
    expect(bucketOf(null)).toBe("none");
    expect(bucketOf(60)).toBe("under5");
    expect(bucketOf(5 * 60)).toBe("under15");
    expect(bucketOf(59 * 60)).toBe("under60");
    expect(bucketOf(3 * 3600)).toBe("under240");
    expect(bucketOf(10 * 3600)).toBe("under1440");
    expect(bucketOf(2 * 86400)).toBe("over1440");
  });

  it("keeps up to 92 days daily and adds longer periods into weeks", () => {
    const days = eachDay({ from: "2026-01-01", to: "2026-04-30" }).map((day) => ({
      day,
      leads: 1,
      won: 0,
    }));
    const weekly = bucketTrend(days);
    expect(weekly.unit).toBe("week");
    expect(weekly.points[0]).toEqual({ x: "2026-01-01", leads: 7, won: 0 });
    expect(weekly.points.reduce((s, p) => s + p.leads, 0)).toBe(days.length);
    expect(bucketTrend(days.slice(0, 30)).unit).toBe("day");
  });
});

describe("weekly report schedule", () => {
  const setting = { enabled: true, weekday: 1, hour: 8, recipients: [] };

  it("is due on the chosen weekday from the chosen hour, in the agency time zone", () => {
    // Monday 26 Oct 2026, 04:00 UTC = 08:00 in Dubai.
    const local = localWeekdayHour(new Date("2026-10-26T04:00:00Z"), "Asia/Dubai");
    expect(local).toEqual({ weekday: 1, hour: 8 });
    expect(weeklyReportDue(setting, local)).toBe(true);
    expect(weeklyReportDue(setting, { weekday: 1, hour: 7 })).toBe(false);
    expect(weeklyReportDue(setting, { weekday: 1, hour: 15 })).toBe(true);
    expect(weeklyReportDue(setting, { weekday: 2, hour: 8 })).toBe(false);
    expect(weeklyReportDue({ ...setting, enabled: false }, local)).toBe(false);
    // Sunday 23:30 UTC is already Monday 03:30 in Dubai.
    expect(localWeekdayHour(new Date("2026-10-25T23:30:00Z"), "Asia/Dubai")).toEqual({
      weekday: 1,
      hour: 3,
    });
  });

  it("covers the 7 days before the send day", () => {
    expect(weeklyReportPeriod("2026-10-26")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
  });
});
