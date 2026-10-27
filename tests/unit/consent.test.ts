import { describe, expect, it } from "vitest";
import { allows, consentFromCookieString, parseConsent, serializeConsent } from "@/lib/consent";

describe("cookie consent", () => {
  it("writes and reads the choice", () => {
    const value = serializeConsent({ analytics: true, marketing: false, at: 1_760_000_000_123 });
    expect(value).toBe("v1.a1.m0.1760000000");
    expect(parseConsent(value)).toEqual({
      analytics: true,
      marketing: false,
      at: 1_760_000_000_000,
    });
  });

  it("ignores anything it does not recognise", () => {
    expect(parseConsent("yes")).toBeNull();
    expect(parseConsent("v2.a1.m1.1")).toBeNull();
    expect(parseConsent(undefined)).toBeNull();
  });

  it("finds the cookie among others and answers per category", () => {
    const c = consentFromCookieString(
      "a=1; propel_consent=v1.a0.m1.1760000000; propel_currency=USD",
    );
    expect(c).toMatchObject({ analytics: false, marketing: true });
    expect(allows(c, "marketing")).toBe(true);
    expect(allows(c, "analytics")).toBe(false);
    expect(allows(null, "analytics")).toBe(false);
    expect(consentFromCookieString("a=1")).toBeNull();
  });
});
