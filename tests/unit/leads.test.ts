import { describe, expect, it } from "vitest";
import {
  parseVisitorCookie,
  visitorCookieUpdate,
  visitorCookieValue,
} from "@/features/attribution/visitor-cookie";
import { findRefCode, newRefCode, withRefCode } from "@/features/attribution/whatsapp-ref";
import { enrichRequirements, mergeRequirements } from "@/features/leads/requirements";
import { reasonsText, scoreLead } from "@/features/leads/score";
import { fillTemplate, templateDefaults } from "@/features/messages/defaults";

const key = "0192f000-0000-7000-8000-0000000000aa";

describe("visitor cookie", () => {
  it("reads year-long and session-only ids and rejects anything else", () => {
    expect(parseVisitorCookie(key)).toEqual({ key, sessionOnly: false });
    expect(parseVisitorCookie(`s.${key}`)).toEqual({ key, sessionOnly: true });
    expect(parseVisitorCookie("s.nope")).toBeNull();
    expect(parseVisitorCookie(undefined)).toBeNull();
    expect(visitorCookieValue({ key, sessionOnly: true })).toBe(`s.${key}`);
  });

  it("is set for new visitors and when consent changes, keeping the id", () => {
    const fresh = () => key;
    expect(visitorCookieUpdate(undefined, false, fresh)).toEqual({ key, sessionOnly: false });
    expect(visitorCookieUpdate("junk", true, fresh)).toEqual({ key, sessionOnly: true });
    expect(visitorCookieUpdate(key, false, fresh)).toBeNull();
    expect(visitorCookieUpdate(key, true, fresh)).toEqual({ key, sessionOnly: true });
    expect(visitorCookieUpdate(`s.${key}`, false, fresh)).toEqual({ key, sessionOnly: false });
  });
});

describe("WhatsApp reference codes", () => {
  it("adds [label·code] to the message and finds it in a reply", () => {
    const code = newRefCode();
    expect(code).toMatch(/^[a-z2-9]{4}$/);
    const href = withRefCode(
      "https://wa.me/971501112233?text=Hello%2C%20I'm%20interested%20in%20HD-2041",
      "HD-2041",
      "k3f9",
    );
    expect(decodeURIComponent(href.split("text=")[1]!)).toBe(
      "Hello, I'm interested in HD-2041 [HD-2041·k3f9]",
    );
    expect(findRefCode("Hello, I'm interested in HD-2041 [HD-2041·k3f9] thanks")).toEqual({
      label: "HD-2041",
      code: "k3f9",
    });
    expect(findRefCode("Just hello")).toBeNull();
  });
});

describe("message templates", () => {
  it("fills variables and tidies the gaps empty ones leave", () => {
    const body = templateDefaults["lead.new"].email.body;
    expect(
      fillTemplate(body, {
        name: "Sam",
        phone: null,
        email: "sam@example.com",
        interest: "HD-2041",
        agent: "Layla",
        details: "",
        message: "Hi",
      }),
    ).toBe("Sam · sam@example.com\nInterested in: HD-2041\nAssigned to: Layla\n\nHi");
    expect(
      fillTemplate("New lead: {{name}} · {{reference}} · {{source}}", {
        name: "Sam",
        source: "Form",
      }),
    ).toBe("New lead: Sam · Form");
    expect(fillTemplate("{{ unknown }}x", {})).toBe("x");
  });
});

describe("requirements", () => {
  const listing = {
    purpose: "sale" as const,
    locationId: "loc",
    propertyTypeId: "type",
    beds: 2,
    price: 1_000_000,
    currency: "AED",
  };
  it("fill gaps from the listing, never what the lead said", () => {
    expect(enrichRequirements({ bedsMin: 3, purpose: "sale" }, listing)).toEqual({
      purpose: "sale",
      bedsMin: 3,
      locationIds: ["loc"],
      propertyTypeIds: ["type"],
      budgetMin: 850_000,
      budgetMax: 1_150_000,
      currency: "AED",
      budgetFrom: "listing",
    });
    expect(enrichRequirements({}, null, "project-area")).toEqual({ locationIds: ["project-area"] });
  });
  it("merge keeps answers and lets a stated budget replace a worked-out one", () => {
    const current = enrichRequirements({}, listing);
    expect(
      mergeRequirements(current, { budgetMax: 900_000, budgetFrom: "lead", finance: "cash" }),
    ).toMatchObject({
      budgetMin: null,
      budgetMax: 900_000,
      budgetFrom: "lead",
      finance: "cash",
      bedsMin: 2,
    });
    expect(mergeRequirements({ bedsMin: 2 }, { bedsMin: 4 })).toEqual({ bedsMin: 2 });
  });
});

describe("lead score (10 §2 rubric)", () => {
  const base = {
    requirements: {},
    hasEmail: false,
    hasPhone: false,
    askedForViewing: false,
    listingPrices: [],
    preApproved: false,
    hasMessage: false,
  };
  it("rewards a ready buyer and explains why", () => {
    const { score, reasons } = scoreLead({
      ...base,
      requirements: {
        budgetMin: 900_000,
        budgetMax: 1_100_000,
        budgetFrom: "lead",
        timeline: "1_3_months",
        finance: "cash",
      },
      hasEmail: true,
      hasPhone: true,
      askedForViewing: true,
      listingPrices: [1_000_000],
      hasMessage: true,
    });
    expect(score).toBe(100);
    expect(reasonsText(reasons)).toBe(
      [
        "+15 Gave a budget",
        "+10 Budget fits the homes asked about",
        "+15 Wants to move within 3 months",
        "+10 Cash buyer or pre-approved",
        "+10 Gave email and phone",
        "+15 Asked for a viewing",
      ].join("\n"),
    );
  });
  it("marks vague contacts down and ignores a budget worked out from a listing", () => {
    expect(scoreLead({ ...base, hasEmail: true })).toEqual({
      score: 20,
      reasons: [
        { label: "Gave one way to reach them", points: 5 },
        { label: "Only browsing or vague", points: -15 },
      ],
    });
    expect(
      scoreLead({
        ...base,
        hasMessage: true,
        requirements: { budgetMin: 1, budgetMax: 2, budgetFrom: "listing" },
      }).score,
    ).toBe(30);
  });
});
