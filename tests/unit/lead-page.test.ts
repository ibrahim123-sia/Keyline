import { describe, expect, it } from "vitest";
import type { Touch } from "@/db/schema/crm";
import { attributionSentence, landingText, touchSource } from "@/features/attribution/describe";
import { durationText, leadFiltersFrom, relativeTime } from "@/features/leads/filters";
import { hasCriteria, matchCriteria } from "@/features/leads/match-criteria";
import { suggestNextStep, type NextStepInput } from "@/features/leads/next-step";

const now = new Date("2026-10-21T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const touch = (t: Partial<Touch> & Pick<Touch, "channel">): Touch => ({
  landing_path: "/",
  at: ago(0),
  ...t,
});

describe("attribution in words (09 §2)", () => {
  it("tells the first and the converting touch", () => {
    const first = touch({
      channel: "paid_search",
      gclid: "g",
      utm_source: "google",
      utm_campaign: "marina-2bed",
      landing_path: "/buy/dubai-marina",
      at: ago(12),
    });
    const last = touch({
      channel: "paid_social",
      utm_source: "instagram",
      utm_campaign: "offplan-oct",
      landing_path: "/property/marina-2-bed",
      at: ago(0),
    });
    expect(attributionSentence(first, last, now)).toBe(
      "First came from Google Ads (campaign marina-2bed) 12 days ago; converted after Instagram ad (offplan-oct) on a property page.",
    );
  });

  it("one touch, direct visits and no visits", () => {
    const only = touch({
      channel: "organic_search",
      referrer: "https://www.google.com/",
      at: ago(1),
    });
    expect(attributionSentence(only, only, now)).toBe(
      "First came from Google search yesterday, landing on the home page.",
    );
    expect(attributionSentence(touch({ channel: "direct", at: ago(3) }), null, now)).toBe(
      "First came directly 3 days ago, landing on the home page.",
    );
    expect(attributionSentence(null, null, now)).toBeNull();
  });

  it("names sources and landings", () => {
    expect(
      touchSource(touch({ channel: "organic_social", referrer: "https://l.instagram.com/" })),
    ).toBe("Instagram");
    expect(touchSource(touch({ channel: "paid_social", fbclid: "f" }))).toBe("Facebook ad");
    expect(touchSource(touch({ channel: "paid_social", ttclid: "t" }))).toBe("TikTok ad");
    expect(touchSource(touch({ channel: "paid_search", msclkid: "m" }))).toBe("Microsoft Ads");
    expect(touchSource(touch({ channel: "offline_qr", utm_source: "flyer" }))).toBe(
      "a QR code (flyer)",
    );
    expect(
      touchSource(touch({ channel: "referral", referrer: "https://news.example.org/a" })),
    ).toBe("a link on news.example.org");
    expect(touchSource(touch({ channel: "email" }))).toBe("an email");
    expect(landingText("/projects/the-linden")).toBe("on a project page");
    expect(landingText("/rent/dubai-marina")).toBe("on a search page");
  });
});

describe("next step rules", () => {
  const base: NextStepInput = {
    status: "open",
    name: "Sara Khan",
    answered: true,
    waitingMinutes: 0,
    overdueTask: null,
    upcomingViewing: null,
    viewingDoneNoFeedback: false,
    matchingCount: 0,
    shortlistSent: false,
    daysSinceActivity: 0,
    followUpAfterDays: 3,
    hasPhone: true,
  };
  it("goes by urgency", () => {
    expect(suggestNextStep({ ...base, status: "won" }).key).toBe("closed");
    expect(suggestNextStep({ ...base, answered: false, waitingMinutes: 25 })).toEqual({
      key: "first_reply",
      text: "Reply first: Sara has waited 25 min. A call works best.",
    });
    expect(suggestNextStep({ ...base, overdueTask: { title: "Send floor plans" } }).text).toBe(
      "Do the overdue task: Send floor plans.",
    );
    expect(
      suggestNextStep({ ...base, upcomingViewing: { startsAt: new Date("2026-10-24T10:00:00Z") } })
        .key,
    ).toBe("confirm_viewing");
    expect(suggestNextStep({ ...base, viewingDoneNoFeedback: true }).key).toBe("viewing_feedback");
    expect(suggestNextStep({ ...base, matchingCount: 3 }).text).toBe(
      "Send Sara the 3 matching homes.",
    );
    expect(
      suggestNextStep({ ...base, matchingCount: 3, shortlistSent: true, daysSinceActivity: 5 })
        .text,
    ).toBe("Follow up: no contact for 5 days.");
    expect(suggestNextStep(base).key).toBe("book_viewing");
  });
});

describe("matching criteria and list helpers", () => {
  const rates = {
    base: { code: "AED", symbol: "AED", symbolPosition: "before" as const, decimals: 2 },
    others: [
      { code: "USD", symbol: "$", symbolPosition: "before" as const, decimals: 2, rate: 0.25 },
    ],
  };
  it("turns requirements into a search in the base currency", () => {
    expect(
      matchCriteria(
        {
          purpose: "sale",
          budgetMin: 30_000_000,
          budgetMax: 40_000_000,
          currency: "USD",
          bedsMin: 2,
          locationIds: ["a"],
        },
        rates,
      ),
    ).toEqual({
      purpose: "sale",
      locationIds: ["a"],
      propertyTypeIds: [],
      bedsMin: 2,
      minBase: 120_000_000,
      maxBase: 160_000_000,
    });
    expect(hasCriteria(matchCriteria({}, rates))).toBe(false);
    expect(hasCriteria(matchCriteria({ budgetMax: 1 }, rates))).toBe(true);
  });

  it("reads filters from the address and formats times", () => {
    const f = leadFiltersFrom(
      (k) => ({ smin: "70", agent: "none", viewing: "week", bmin: "x", status: "won" })[k],
      (k) => (k === "source" ? ["form", "nope"] : k === "channel" ? ["paid_social"] : []),
      " Sara ",
    );
    expect(f).toMatchObject({
      q: "Sara",
      scoreMin: 70,
      agent: "none",
      viewing: "week",
      budgetMin: null,
      status: "won",
      source: ["form"],
      channel: ["paid_social"],
    });
    expect(durationText(45)).toBe("45 s");
    expect(durationText(25 * 60)).toBe("25 min");
    expect(durationText(125 * 60)).toBe("2 h 5 min");
    expect(durationText(5 * 86_400)).toBe("5 days");
    expect(relativeTime(ago(1), now)).toBe("yesterday");
    expect(relativeTime(new Date(now.getTime() - 5 * 60_000), now)).toBe("5 min ago");
  });
});
