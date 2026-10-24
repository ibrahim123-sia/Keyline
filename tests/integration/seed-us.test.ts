import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { usDemo } from "@/db/seed/presets/us-demo";
import { seedPreset, type SeedResult } from "@/db/seed/run";
import { buildSiteMenus } from "@/features/menus/queries";
import { currencyFormats, priceLabel } from "@/features/properties/format";
import { parseSearch } from "@/features/search/params";
import { searchListings } from "@/features/search/query";
import { loadSettings } from "@/features/settings/queries";
import { formatArea, formatDistance } from "@/lib/units";
import { memoryStorage, setStorage } from "@/lib/storage";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const rows = async <T>(query: string) =>
  (await (await getDb()).execute(sql.raw(query))).rows as T[];

/**
 * 16 §2: the US-style preset. Same code as Haven & Dune; only settings and data differ, and
 * the shared formatting reads them (dollars, square feet, miles, rent per month).
 */
describe("demo seed: Maple & Main Realty (US preset)", () => {
  let result: SeedResult;

  beforeAll(async () => {
    setStorage(memoryStorage());
    result = await seedPreset(await getDb(), usDemo, {
      reset: true,
      now: new Date("2026-10-20T14:00:00Z"),
    });
  }, 240_000);
  afterAll(async () => {
    setStorage(null);
    await truncate("settings");
  });

  it("creates the 16 §2 mix: 12 listings, 8 leads, a home page and 2 posts", async () => {
    expect(result.counts).toMatchObject({
      properties: 12,
      locations: 5,
      posts: 2,
      projects: 1,
      agents: 3,
    });
    // 8 demo leads plus the past tour of each demo customer.
    expect(
      await rows<{ n: number }>(
        "select count(*)::int as n from leads where source_detail is distinct from 'booking'",
      ),
    ).toEqual([{ n: 8 }]);
    expect(
      await rows<{ n: number }>(
        "select count(*)::int as n from pages where is_home and status = 'published'",
      ),
    ).toEqual([{ n: 1 }]);
    expect(result.admins.map((a) => a.email)).toEqual([
      "admin@demo.keyline",
      "staff@demo.keyline",
      "viewer@demo.keyline",
    ]);
    expect(result.customers.map((c) => c.email)).toEqual([
      "taylor@demo.keyline",
      "chris.customer@demo.keyline",
      "riley@demo.keyline",
    ]);
  });

  it("sets a US market: USD, square feet, miles, rent per month, no permits or split rent", async () => {
    const market = await loadSettings("market", await getDb());
    expect(market).toMatchObject({
      areaUnit: "sqft",
      distanceUnit: "mi",
      rentPeriod: "month",
      rentPaymentOptions: [],
      phoneCountryCode: "+1",
      permit: { enabled: false },
    });
    expect(market.baseCurrency).toMatchObject({ code: "USD", symbol: "$" });
    expect((await loadSettings("general", await getDb())).timeZone).toBe("America/Chicago");
  });

  it("listings follow the market: monthly rents, no permit numbers, maid's rooms or cheques", async () => {
    const listings = await rows<{
      purpose: string;
      price_period: string | null;
      currency: string;
      permit_number: string | null;
      maid_room: boolean;
      rent_payment_options: number[];
      service_charge_per_area: number | null;
      ownership: string | null;
    }>("select * from properties");
    expect(listings).toHaveLength(12);
    for (const l of listings) {
      expect(l.currency).toBe("USD");
      expect(l.permit_number).toBeNull();
      expect(l.maid_room).toBe(false);
      expect(l.rent_payment_options).toEqual([]);
      expect(l.service_charge_per_area).toBeNull();
      expect(l.price_period).toBe(l.purpose === "rent" ? "month" : null);
    }
    expect(new Set(listings.map((l) => l.ownership))).toEqual(new Set(["Fee simple"]));
    expect(
      await rows<{ n: number }>(
        "select count(*)::int as n from properties where completion = 'off_plan'",
      ),
    ).toEqual([{ n: 1 }]);
  });

  it("the shared formatting shows dollars, square feet and miles from Settings", async () => {
    const market = await loadSettings("market", await getDb());
    const formats = currencyFormats(market);
    const [rent] = await rows<{ price: number; currency: string; size: number }>(
      "select price, currency, size from properties where purpose = 'rent' order by price limit 1",
    );
    expect(
      priceLabel(
        { ...rent!, priceOnRequest: false, pricePeriod: "month", purpose: "rent" },
        formats,
      ),
    ).toBe("$2,450 / month");
    expect(formatArea(rent!.size, market.areaUnit)).toBe("760 sq ft");
    const [poi] = await rows<{ straight_distance_m: number }>(
      "select straight_distance_m from property_pois order by straight_distance_m limit 1",
    );
    expect(formatDistance(poi!.straight_distance_m, market.distanceUnit)).toMatch(/ mi$/);
  });

  it("listings are searchable by neighborhood and the menus use US wording", async () => {
    const zilker = await searchListings(parseSearch({ loc: "zilker" }));
    expect(zilker.total).toBeGreaterThanOrEqual(1);
    const rent = await searchListings(parseSearch({ purpose: "rent" }));
    expect(rent.total).toBe(4);
    const menus = await buildSiteMenus(await getDb());
    expect(menus.header.links.map((l) => l.label)).toEqual(
      expect.arrayContaining(["Buy", "Rent", "New construction", "Agents"]),
    );
    expect(menus.footer_2.title).toBe("Neighborhoods");
  });

  it("nothing from the other market leaks in", async () => {
    const text = JSON.stringify(
      await rows("select title, address_line, agency_fee_text, highlights from properties"),
    );
    expect(text).not.toMatch(/Dubai|AED|\+971|Emirates|cheque/i);
    const contacts = await rows<{ phone: string | null }>("select phone from contacts");
    for (const c of contacts) if (c.phone) expect(c.phone).toMatch(/^\+1512555\d{4}$/);
  });
});
