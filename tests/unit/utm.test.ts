import { describe, expect, it } from "vitest";
import {
  campaignUrl,
  newShortCode,
  SHORT_CODE,
  sitePath,
  utmLinkInputSchema,
} from "@/features/utm/links";

const origin = "https://havendune.example";

describe("UTM links (09 §2)", () => {
  it("accepts pages on this site only", () => {
    expect(sitePath("/buy/dubai-marina?beds=2", origin)).toBe("/buy/dubai-marina?beds=2");
    expect(sitePath("https://havendune.example/property/x", origin)).toBe("/property/x");
    expect(sitePath("https://www.havendune.example/rent", origin)).toBe("/rent");
    expect(sitePath("https://evil.example/", origin)).toBeNull();
    expect(sitePath("//evil.example/x", origin)).toBeNull();
    expect(sitePath("javascript:alert(1)", origin)).toBeNull();
    expect(sitePath("", origin)).toBeNull();
  });

  it("builds the full address, replacing old tags and keeping filters", () => {
    expect(
      campaignUrl(origin, "/buy?beds=2&utm_source=old", {
        utmSource: "instagram",
        utmMedium: "paid_social",
        utmCampaign: "marina-oct",
        utmContent: "reel-1",
      }),
    ).toBe(
      "https://havendune.example/buy?beds=2&utm_source=instagram&utm_medium=paid_social&utm_campaign=marina-oct&utm_content=reel-1",
    );
  });

  it("short codes avoid look-alike characters; tags have no spaces", () => {
    for (let i = 0; i < 50; i++) expect(newShortCode()).toMatch(SHORT_CODE);
    expect(SHORT_CODE.test("abc10")).toBe(false);
    const base = { name: "Ad", baseUrl: "/", utmMedium: "cpc", utmCampaign: "x" };
    expect(utmLinkInputSchema.safeParse({ ...base, utmSource: "insta gram" }).success).toBe(false);
    expect(utmLinkInputSchema.safeParse({ ...base, utmSource: "" }).success).toBe(false);
    expect(utmLinkInputSchema.parse({ ...base, utmSource: "google" })).toMatchObject({
      utmTerm: null,
      utmContent: null,
    });
  });
});
