import { describe, expect, it } from "vitest";
import { settingGroups } from "@/db/schema/system";
import {
  defaultsFor,
  desertModernColors,
  parseGroupInput,
  readGroup,
  settingsSchemas,
} from "@/features/settings/schema";

describe("settings schemas", () => {
  it("has a schema with full defaults for every group", () => {
    for (const group of settingGroups) {
      expect(settingsSchemas[group], group).toBeDefined();
      expect(() => defaultsFor(group)).not.toThrow();
    }
  });

  it("defaults branding to Desert Modern", () => {
    const b = defaultsFor("branding");
    expect(b.colors).toEqual(desertModernColors);
    expect(b.fontDisplay).toBe("Fraunces");
    expect(b.fontBody).toBe("Manrope");
  });

  it("keeps market defaults neutral (no hard-coded market)", () => {
    const m = defaultsFor("market");
    expect(m.countryCode).toBeNull();
    expect(m.visitorCurrencies).toEqual([]);
    expect(m.permit.enabled).toBe(false);
  });

  it("falls back per field when a stored value no longer validates", () => {
    const { value, invalidKeys } = readGroup("general", {
      agencyName: "Haven & Dune",
      timeZone: "Asia/Dubai",
      firstDayOfWeek: 9, // invalid
    });
    expect(value.agencyName).toBe("Haven & Dune");
    expect(value.timeZone).toBe("Asia/Dubai");
    expect(value.firstDayOfWeek).toBe(1);
    expect(invalidKeys).toEqual(["firstDayOfWeek"]);
  });

  it("treats a missing or malformed row as defaults", () => {
    expect(readGroup("seo", null).value).toEqual(defaultsFor("seo"));
    expect(readGroup("seo", "oops").value).toEqual(defaultsFor("seo"));
  });

  it("rejects unknown keys and invalid colours in admin input", () => {
    const unknown = parseGroupInput("general", { ...defaultsFor("general"), hacked: true });
    expect(unknown.success).toBe(false);

    const branding = defaultsFor("branding");
    const bad = parseGroupInput("branding", {
      ...branding,
      colors: { ...branding.colors, accent: "red" },
    });
    expect(bad.success).toBe(false);
  });

  it("accepts a full Haven & Dune style market", () => {
    const res = parseGroupInput("market", {
      ...defaultsFor("market"),
      baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 0 },
      visitorCurrencies: [
        {
          code: "USD",
          symbol: "$",
          symbolPosition: "before",
          decimals: 0,
          rate: 0.2723,
          isExample: true,
        },
      ],
      areaUnit: "sqft",
      rentPeriod: "year",
      rentPaymentOptions: [1, 2, 4, 6, 12],
      permit: { enabled: true, label: "Permit no.", requiredOnPublish: true },
    });
    expect(res.success).toBe(true);
  });
});
