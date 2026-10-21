import { describe, expect, it } from "vitest";
import { announcementSchema, defaultsFor } from "@/features/settings/schema";
import { announcementWindow, secondsUntil } from "@/features/website/announcement";
import { isoToWallTime, wallTimeToIso } from "@/lib/zoned-time";

const base = {
  enabled: true,
  text: "New launch: Pier Seven",
  linkLabel: "See the project",
  href: "/projects/pier-seven",
  startsAt: null,
  endsAt: null,
};

describe("announcement bar", () => {
  it("defaults to off", () => {
    expect(defaultsFor("website").announcement).toMatchObject({ enabled: false, text: "" });
    expect(defaultsFor("website").footer).toEqual({ text: "", legalText: "" });
  });

  it("validates text, link pairs, safe links and the date order", () => {
    expect(announcementSchema.safeParse(base).success).toBe(true);
    const noText = announcementSchema.safeParse({ ...base, text: "" });
    expect(noText.error?.issues[0]?.path).toEqual(["text"]);
    const half = announcementSchema.safeParse({ ...base, href: "" });
    expect(half.error?.issues[0]?.path).toEqual(["href"]);
    expect(announcementSchema.safeParse({ ...base, href: "javascript:alert(1)" }).success).toBe(
      false,
    );
    expect(announcementSchema.safeParse({ ...base, href: "//evil.example" }).success).toBe(false);
    const order = announcementSchema.safeParse({
      ...base,
      startsAt: "2026-11-02T00:00:00.000Z",
      endsAt: "2026-11-01T00:00:00.000Z",
    });
    expect(order.error?.issues[0]?.path).toEqual(["endsAt"]);
    expect(announcementSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });

  it("works out when it shows and when that changes", () => {
    const start = Date.parse("2026-11-01T06:00:00.000Z");
    const end = Date.parse("2026-11-08T06:00:00.000Z");
    const a = {
      ...base,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
    };
    expect(announcementWindow(a, start - 1000)).toEqual({ state: "scheduled", nextChange: start });
    expect(announcementWindow(a, start)).toEqual({ state: "live", nextChange: end });
    expect(announcementWindow(a, end)).toEqual({ state: "ended", nextChange: null });
    expect(announcementWindow({ ...a, enabled: false }, start)).toEqual({
      state: "off",
      nextChange: null,
    });
    expect(announcementWindow(base, start)).toEqual({ state: "live", nextChange: null });
    expect(secondsUntil(start, start - 10_000)).toBe(60);
    expect(secondsUntil(start, start - 3_600_000)).toBe(3600);
    expect(secondsUntil(start, start - 90 * 86_400_000)).toBe(30 * 86_400);
  });
});

describe("wall times in the agency time zone", () => {
  it("converts both ways, across daylight saving", () => {
    expect(wallTimeToIso("2026-10-21T09:30", "Asia/Dubai")).toBe("2026-10-21T05:30:00.000Z");
    expect(isoToWallTime("2026-10-21T05:30:00.000Z", "Asia/Dubai")).toBe("2026-10-21T09:30");
    // London: summer time (UTC+1) in July, winter time (UTC+0) in December.
    expect(wallTimeToIso("2026-07-01T12:00", "Europe/London")).toBe("2026-07-01T11:00:00.000Z");
    expect(wallTimeToIso("2026-12-01T12:00", "Europe/London")).toBe("2026-12-01T12:00:00.000Z");
    expect(isoToWallTime("2026-12-01T12:00:00.000Z", "America/New_York")).toBe("2026-12-01T07:00");
    expect(wallTimeToIso("not a time", "UTC")).toBeNull();
    expect(isoToWallTime(null, "UTC")).toBe("");
  });
});
