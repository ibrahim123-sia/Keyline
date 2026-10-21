import { describe, expect, it } from "vitest";
import { videoEmbedUrl } from "@/components/site/property/lightbox";
import { normalizeVisitorPhone } from "@/features/inquiries/schema";
import { monthlyPayment, yields } from "@/features/listings/finance";
import { APPROX_RADIUS_M, publicPoint } from "@/features/listings/public-point";
import { haversineMeters } from "@/lib/geo";

describe("public map point", () => {
  it("shows the exact pin only when the listing allows it", () => {
    expect(publicPoint("a", { lng: 55.123456, lat: 25.098765 }, true)).toEqual({
      lng: 55.123456,
      lat: 25.098765,
      approx: false,
      radiusM: 0,
    });
  });

  it("moves a private pin, the same way every time, and keeps it inside the circle", () => {
    const exact = { lng: 55.123456, lat: 25.098765 };
    const ids = Array.from({ length: 200 }, (_, i) => `0199a${String(i).padStart(4, "0")}-listing`);
    for (const id of ids) {
      const p = publicPoint(id, exact, false);
      expect(p.approx).toBe(true);
      expect([p.lng, p.lat]).not.toEqual([exact.lng, exact.lat]);
      expect(publicPoint(id, exact, false)).toEqual(p);
      expect(haversineMeters(exact, p)).toBeLessThan(APPROX_RADIUS_M);
    }
  });
});

describe("visitor phone numbers", () => {
  it.each([
    ["+971 50 123 4567", "+971", "+971501234567"],
    ["00971501234567", "+971", "+971501234567"],
    ["050 123 4567", "+971", "+971501234567"],
    ["(020) 7946-0000", "+44", "+442079460000"],
    ["050 123 4567", null, null],
    ["12", "+971", null],
    ["", "+971", null],
  ])("%s with %s gives %s", (raw, code, out) => {
    expect(normalizeVisitorPhone(raw, code)).toBe(out);
  });
});

describe("listing money maths", () => {
  it("works out monthly repayments", () => {
    // 1,960,000.00 over 25 years at 5%: 11,457.96 a month.
    expect(monthlyPayment(196_000_000, 5, 25)).toBe(1_145_796);
    expect(monthlyPayment(120_000, 0, 1)).toBe(10_000);
    expect(monthlyPayment(0, 5, 25)).toBe(0);
  });

  it("gives gross and estimated net yields", () => {
    const y = yields(
      { price: 200_000_000, rentYearly: 14_000_000, serviceChargePerArea: 15_000, size: 100 },
      { vacancyPct: 5, maintenancePct: 1, purchaseCostsPct: 4 },
    );
    // Gross 7%. Net: (13,300,000 - 1,500,000 - 2,000,000) / 208,000,000 = 4.7%.
    expect(y).toEqual({ gross: 7, net: 4.7 });
  });
});

describe("video links", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc123", "https://www.youtube-nocookie.com/embed/abc123"],
    ["https://youtu.be/abc123", "https://www.youtube-nocookie.com/embed/abc123"],
    ["https://youtube.com/shorts/abc123", "https://www.youtube-nocookie.com/embed/abc123"],
    ["https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871"],
    ["https://example.com/tour.mp4", null],
    ["not a url", null],
  ])("%s", (url, embed) => {
    expect(videoEmbedUrl(url)).toBe(embed);
  });
});
