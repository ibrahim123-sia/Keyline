import { describe, expect, it } from "vitest";
import {
  campaignData,
  channelFor,
  externalReferrerHost,
  nextTouches,
  touchFrom,
} from "@/features/attribution/touch";

const site = "havendune.example";
const at = new Date("2026-10-01T10:00:00Z");
const land = (search: string, referrer: string | null = null, landingPath = "/") =>
  touchFrom({ search, referrer, landingPath, siteHost: site, portals: ["Property Finder"], at });

describe("campaign data and referrers", () => {
  it("reads every campaign parameter and drops empty ones", () => {
    expect(
      campaignData(
        "?utm_source=google&utm_medium=cpc&utm_campaign=marina-2bed&gclid=abc&utm_term=",
      ),
    ).toEqual({
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "marina-2bed",
      gclid: "abc",
    });
    expect(campaignData("?page=2")).toEqual({});
  });

  it("treats this site, other schemes and junk as no external referrer", () => {
    expect(externalReferrerHost("https://www.google.com/search?q=x", site)).toBe("google.com");
    expect(externalReferrerHost(`https://${site}/buy`, site)).toBeNull();
    expect(externalReferrerHost(`https://www.${site}/buy`, `${site}:3000`)).toBeNull();
    expect(externalReferrerHost("android-app://com.example", site)).toBeNull();
    expect(externalReferrerHost("not a url", site)).toBeNull();
    expect(externalReferrerHost("", site)).toBeNull();
  });
});

describe("channel (09 §2)", () => {
  it("click ids and paid mediums are paid", () => {
    expect(channelFor({ gclid: "x" }, null)).toBe("paid_search");
    expect(channelFor({ gbraid: "x" }, null)).toBe("paid_search");
    expect(channelFor({ msclkid: "x" }, "bing.com")).toBe("paid_search");
    expect(channelFor({ fbclid: "x" }, "l.facebook.com")).toBe("paid_social");
    expect(channelFor({ ttclid: "x" }, null)).toBe("paid_social");
    expect(channelFor({ li_fat_id: "x" }, null)).toBe("paid_social");
    expect(channelFor({ utm_source: "google", utm_medium: "cpc" }, null)).toBe("paid_search");
    expect(channelFor({ utm_source: "instagram", utm_medium: "cpc" }, null)).toBe("paid_social");
    expect(channelFor({ utm_source: "meta", utm_medium: "paid_social" }, null)).toBe("paid_social");
  });

  it("search engines and social sites without UTM data are organic", () => {
    expect(channelFor({}, "google.com")).toBe("organic_search");
    expect(channelFor({}, "google.co.uk")).toBe("organic_search");
    expect(channelFor({}, "duckduckgo.com")).toBe("organic_search");
    expect(channelFor({}, "instagram.com")).toBe("organic_social");
    expect(channelFor({}, "l.facebook.com")).toBe("organic_social");
    expect(channelFor({}, "t.co")).toBe("organic_social");
    expect(channelFor({}, "mail.google.com")).toBe("email");
    // UTM data wins over the referrer.
    expect(channelFor({ utm_source: "newsletter", utm_medium: "email" }, "google.com")).toBe(
      "email",
    );
  });

  it("email, QR codes, portals, referrals and direct", () => {
    expect(channelFor({ utm_medium: "email" }, null)).toBe("email");
    expect(channelFor({ utm_source: "flyer", utm_medium: "qr" }, null)).toBe("offline_qr");
    expect(channelFor({ utm_source: "propertyfinder" }, null, ["Property Finder"])).toBe("portal");
    expect(channelFor({ utm_source: "property-finder" }, null, ["Property Finder"])).toBe("portal");
    expect(channelFor({ utm_source: "propertyfinder" }, null, [])).toBe("referral");
    expect(channelFor({}, "news.example.org")).toBe("referral");
    expect(channelFor({}, "docs.google.com")).toBe("referral");
    expect(channelFor({ utm_source: "partner", utm_medium: "banner" }, null)).toBe("referral");
    expect(channelFor({}, null)).toBe("direct");
  });
});

describe("touches", () => {
  it("keeps the landing path, the campaign and only the referrer's origin and path", () => {
    const touch = land(
      "?utm_source=instagram&utm_medium=paid_social&utm_campaign=offplan-oct",
      "https://l.instagram.com/redirect?u=secret&e=a@b.c",
      "/property/marina-2-bed",
    );
    expect(touch).toEqual({
      utm_source: "instagram",
      utm_medium: "paid_social",
      utm_campaign: "offplan-oct",
      referrer: "https://l.instagram.com/redirect",
      landing_path: "/property/marina-2-bed",
      channel: "paid_social",
      at: at.toISOString(),
    });
  });

  it("first touch is written once; last touch changes on campaign or referral visits only", () => {
    const google = land("?utm_source=google&utm_medium=cpc&utm_campaign=marina-2bed&gclid=1");
    const direct = land("");
    const instagram = land("", "https://www.instagram.com/");

    const afterFirst = nextTouches({ first: null, last: null }, google);
    expect(afterFirst).toEqual({ first: google, last: google });

    // A direct visit never overwrites last touch.
    expect(nextTouches(afterFirst, direct)).toEqual({ first: google, last: google });

    // A new external referrer does; first touch stays.
    const afterInstagram = nextTouches(afterFirst, instagram);
    expect(afterInstagram).toEqual({ first: google, last: instagram });

    // A visitor who first comes direct has a direct first and last touch until a campaign.
    const directFirst = nextTouches({ first: null, last: null }, direct);
    expect(directFirst).toEqual({ first: direct, last: direct });
    expect(nextTouches(directFirst, google)).toEqual({ first: direct, last: google });
  });
});
