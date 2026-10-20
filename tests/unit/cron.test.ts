import { describe, expect, it } from "vitest";
import { at, every, localTime } from "@/jobs/cron";

describe("cron schedule in the agency time zone", () => {
  it("converts UTC to the agency's local time", () => {
    // 02:00 UTC is 06:00 in Dubai (UTC+4, no DST).
    const t = localTime(new Date("2026-10-20T02:00:00Z"), "Asia/Dubai");
    expect(t).toMatchObject({ hour: 6, minute: 0, weekday: 2, day: 20 });
  });

  it("handles a time zone with daylight saving", () => {
    // New York is UTC-4 in October.
    expect(localTime(new Date("2026-10-20T10:30:00Z"), "America/New_York")).toMatchObject({
      hour: 6,
      minute: 30,
    });
  });

  it("falls back to UTC for an unknown zone", () => {
    expect(localTime(new Date("2026-10-20T10:30:00Z"), "Not/AZone")).toMatchObject({
      hour: 10,
      minute: 30,
    });
  });

  it("matches daily and interval rules", () => {
    expect(at(6)({ hour: 6, minute: 0, weekday: 1, day: 1 })).toBe(true);
    expect(at(6)({ hour: 6, minute: 1, weekday: 1, day: 1 })).toBe(false);
    expect(every(15)({ hour: 3, minute: 45, weekday: 1, day: 1 })).toBe(true);
    expect(every(15)({ hour: 3, minute: 46, weekday: 1, day: 1 })).toBe(false);
    expect(every(10)({ hour: 0, minute: 0, weekday: 1, day: 1 })).toBe(true);
  });
});
