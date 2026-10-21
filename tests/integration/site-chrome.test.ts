import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { locations } from "@/db/schema/master-data";
import { patchSettings } from "@/features/settings/mutations";
import { getPopularAreas } from "@/features/site/areas";
import { CURRENCY_COOKIE, visitorCurrency } from "@/features/site/currency";
import { setCurrency } from "@/features/site/currency-actions";
import { newId } from "@/lib/ids";
import { testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

const jar = new Map<string, { value: string; options?: Record<string, unknown> }>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) =>
      jar.set(name, { value, options }),
  }),
}));

const actor = { type: "admin" as const, id: testAdmin.id };

describe("site header and 404 parts", () => {
  beforeEach(async () => {
    jar.clear();
    await truncate("settings", "locations", "audit_log");
    await patchSettings(
      await getDb(),
      "market",
      {
        baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
        visitorCurrencies: [
          {
            code: "USD",
            symbol: "$",
            symbolPosition: "before",
            decimals: 2,
            rate: 0.2723,
            isExample: true,
          },
        ],
      },
      actor,
    );
  });

  it("remembers an offered currency and refuses others", async () => {
    expect(await visitorCurrency()).toMatchObject({ code: "AED" });
    expect(await setCurrency({ code: "USD" })).toEqual({ ok: true, data: { code: "USD" } });
    expect(jar.get(CURRENCY_COOKIE)).toMatchObject({
      value: "USD",
      options: { path: "/", maxAge: 31_536_000, sameSite: "lax", httpOnly: true },
    });
    expect(await visitorCurrency()).toMatchObject({ code: "USD" });
    expect(await setCurrency({ code: "GBP" })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await setCurrency({ code: "usd" })).toMatchObject({ ok: false });
    // A cookie for a currency the market no longer offers falls back to the base one.
    jar.set(CURRENCY_COOKIE, { value: "EUR" });
    expect(await visitorCurrency()).toMatchObject({ code: "AED" });
  });

  it("lists featured areas for the 404 page", async () => {
    const db = await getDb();
    const city = newId();
    await db.insert(locations).values([
      { id: city, level: "city", name: "Coastal City", slug: "coastal-city", isFeatured: true },
      { parentId: city, level: "area", name: "Old Harbour", slug: "old-harbour", isFeatured: true },
      { parentId: city, level: "area", name: "Quiet Hills", slug: "quiet-hills" },
      {
        parentId: city,
        level: "building",
        name: "Pier Tower",
        slug: "pier-tower",
        isFeatured: true,
      },
    ]);
    expect(await getPopularAreas()).toEqual([
      { name: "Coastal City", slug: "coastal-city" },
      { name: "Old Harbour", slug: "old-harbour" },
    ]);
  });
});
