import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { contacts, leads } from "@/db/schema/crm";
import { locations, propertyTypes } from "@/db/schema/master-data";
import { priceHistory, properties } from "@/db/schema/properties";
import { areaPriceStats } from "@/db/schema/stats";
import { auditLog } from "@/db/schema/system";
import {
  deletePriceFigure,
  listPriceFigures,
  savePriceFigure,
} from "@/features/price-trends/actions";
import { computeAgencyPriceStats } from "@/features/price-trends/compute";
import { getPriceTrends } from "@/features/price-trends/queries";
import { patchSettings } from "@/features/settings/mutations";
import { newId } from "@/lib/ids";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };
const ids = { city: newId(), area: newId(), tower: newId(), apt: newId(), villa: newId() };

let ref = 0;
async function listing(over: Partial<typeof properties.$inferInsert>) {
  ref += 1;
  const id = newId();
  await (await getDb()).insert(properties).values({
    id,
    reference: `PT-${ref}`,
    title: `Home ${ref}`,
    slug: `home-${ref}`,
    purpose: "sale",
    status: "available",
    propertyTypeId: ids.apt,
    locationId: ids.area,
    size: 100,
    price: 1_000_000,
    currency: "AED",
    publishedAt: new Date("2026-08-01T00:00:00Z"),
    ...over,
  });
  return id;
}

const stats = async () =>
  (await getDb()).select().from(areaPriceStats).where(eq(areaPriceStats.source, "agency_data"));

describe("price trends (11 §7)", () => {
  beforeEach(async () => {
    await truncate(
      "properties",
      "price_history",
      "contacts",
      "leads",
      "area_price_stats",
      "locations",
      "property_types",
      "audit_log",
      "settings",
    );
    adminState.user = testAdmin;
    const db = await getDb();
    await patchSettings(db, "general", { timeZone: "UTC" }, actor);
    await patchSettings(
      db,
      "market",
      {
        areaUnit: "sqm",
        rentPeriod: "year",
        baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
      },
      actor,
    );
    await db.insert(propertyTypes).values([
      { id: ids.apt, name: "Apartment", slug: "apartments" },
      { id: ids.villa, name: "Villa", slug: "villas" },
    ]);
    await db.insert(locations).values([
      { id: ids.city, level: "city", name: "Coastal City", slug: "coastal-city" },
      { id: ids.area, parentId: ids.city, level: "area", name: "Old Harbour", slug: "old-harbour" },
      { id: ids.tower, parentId: ids.area, level: "building", name: "Pier 7", slug: "pier-7" },
    ]);
  });

  it("the monthly job: medians per area (with what is inside it) and type, deals, idempotent", async () => {
    const db = await getDb();
    // On the market at the end of September (per m²: 10,000 · 12,000 · 15,000 fils).
    await listing({ size: 100, price: 1_000_000 });
    await listing({ locationId: ids.tower, size: 50, price: 600_000 });
    const villa = await listing({ propertyTypeId: ids.villa, size: 200, price: 2_800_000 });
    // Dropped in October: on 30 September it still asked 3,000,000 (15,000 per m²).
    await db.insert(priceHistory).values({
      propertyId: villa,
      oldPrice: 3_000_000,
      newPrice: 2_800_000,
      currency: "AED",
      changedAt: new Date("2026-10-05T00:00:00Z"),
    });
    // A deal closed in September at 1,250,000 (12,500 per m²), 76 days after going live.
    const sold = await listing({
      status: "sold",
      price: 1_300_000,
      publishedAt: new Date("2026-07-01T00:00:00Z"),
    });
    const [contact] = await db.insert(contacts).values({ name: "Buyer" }).returning();
    await db.insert(leads).values({
      contactId: contact!.id,
      source: "manual",
      status: "won",
      propertyIds: [sold],
      dealValue: 1_250_000,
      dealCurrency: "AED",
      wonAt: new Date("2026-09-15T00:00:00Z"),
    });
    // Not counted: listed in October, a draft, another currency, one rental (too few).
    await listing({ publishedAt: new Date("2026-10-10T00:00:00Z") });
    await listing({ status: "draft" });
    await listing({ currency: "USD" });
    await listing({ purpose: "rent", price: 100_000, pricePeriod: "month" });

    expect(await computeAgencyPriceStats(db, "2026-09-01")).toEqual({
      period: "2026-09-01",
      rows: 4,
    });
    const rows = await stats();
    const find = (loc: string, type: string | null) =>
      rows.find((r) => r.locationId === loc && r.propertyTypeId === type && r.purpose === "sale");
    expect(find(ids.area, null)).toMatchObject({
      period: "2026-09-01",
      medianPricePerArea: 12_250,
      listingsCount: 3,
      dealsCount: 1,
      avgDaysOnMarket: 76,
      currency: "AED",
    });
    expect(find(ids.city, null)).toMatchObject({ medianPricePerArea: 12_250 });
    expect(find(ids.area, ids.apt)).toMatchObject({ medianPricePerArea: 12_000, dealsCount: 1 });
    expect(find(ids.city, ids.apt)).toMatchObject({ medianPricePerArea: 12_000 });
    expect(find(ids.tower, null)).toBeUndefined();
    expect(rows.some((r) => r.purpose === "rent")).toBe(false);

    // An entered figure for the same month survives a re-run; the agency rows are replaced.
    await savePriceFigure({
      locationId: ids.area,
      month: "2026-09",
      purpose: "sale",
      median: 130,
      sourceNote: "Harbour market report, Sep 2026",
    });
    await computeAgencyPriceStats(db, "2026-09-01");
    expect(await stats()).toHaveLength(4);
    const entered = await db
      .select()
      .from(areaPriceStats)
      .where(eq(areaPriceStats.source, "admin_entered"));
    expect(entered).toHaveLength(1);
  });

  it("admin-entered figures: per the market's units, one per month, audited, editable", async () => {
    const db = await getDb();
    await patchSettings(db, "market", { areaUnit: "sqft", rentPeriod: "month" }, actor);
    // AED 1,500 per sq ft -> 150,000 fils / 0.09290304 m².
    const created = await savePriceFigure({
      locationId: ids.area,
      month: "2026-08",
      purpose: "sale",
      median: 1500,
      listingsCount: 42,
      sourceNote: "City land department, August 2026",
    });
    expect(created.ok).toBe(true);
    const [row] = await db
      .select()
      .from(areaPriceStats)
      .where(and(eq(areaPriceStats.purpose, "sale"), isNull(areaPriceStats.propertyTypeId)));
    expect(row).toMatchObject({
      period: "2026-08-01",
      source: "admin_entered",
      listingsCount: 42,
      medianPricePerArea: Math.round(150_000 / 0.09290304),
    });
    // Rent per sq ft per month -> stored per m² per year.
    await savePriceFigure({
      locationId: ids.area,
      month: "2026-08",
      purpose: "rent",
      median: 10,
      sourceNote: "Rent index",
    });
    const list = await listPriceFigures({ locationId: ids.area });
    if (!list.ok) throw new Error(list.error);
    expect(list.data.map((f) => [f.purpose, f.median]).sort()).toEqual([
      ["rent", 10],
      ["sale", 1500],
    ]);
    const [rent] = await db.select().from(areaPriceStats).where(eq(areaPriceStats.purpose, "rent"));
    expect(rent!.medianPricePerArea).toBe(Math.round((1000 * 12) / 0.09290304));

    // The same month twice is refused; a source note is required.
    expect(
      await savePriceFigure({
        locationId: ids.area,
        month: "2026-08",
        purpose: "sale",
        median: 1600,
        sourceNote: "Another report",
      }),
    ).toMatchObject({ ok: false, fieldErrors: { month: [expect.any(String)] } });
    expect(
      await savePriceFigure({
        locationId: ids.area,
        month: "2026-07",
        purpose: "sale",
        median: 1600,
        sourceNote: "",
      }),
    ).toMatchObject({ ok: false, fieldErrors: { sourceNote: [expect.any(String)] } });

    if (!created.ok) return;
    expect(
      await savePriceFigure({
        id: created.data.id,
        locationId: ids.area,
        month: "2026-08",
        purpose: "sale",
        median: 1550,
        sourceNote: "City land department, August 2026 (revised)",
      }),
    ).toMatchObject({ ok: true });
    expect(await deletePriceFigure({ id: created.data.id })).toMatchObject({ ok: true });
    const audit = await db.select({ action: auditLog.action }).from(auditLog);
    expect(
      audit
        .map((a) => a.action)
        .filter((a) => a.startsWith("price_stat"))
        .sort(),
    ).toEqual(["price_stat.create", "price_stat.create", "price_stat.delete", "price_stat.update"]);
  });

  it("the chart data: needs 5 months, labels the type when it has enough", async () => {
    const db = await getDb();
    const add = (month: number, type: string | null, value: number) =>
      db.insert(areaPriceStats).values({
        locationId: ids.area,
        period: `2026-${String(month).padStart(2, "0")}-01`,
        purpose: "sale",
        propertyTypeId: type,
        medianPricePerArea: value,
        currency: "AED",
        source: "agency_data",
      });
    for (let m = 1; m <= 6; m++) await add(m, null, 10_000 + m * 100);
    for (let m = 1; m <= 3; m++) await add(m, ids.villa, 20_000);
    const trends = await getPriceTrends(ids.area, "villas");
    expect(trends?.sale.series[0]?.points).toHaveLength(6);
    // Only 3 villa months: all types instead.
    expect(trends?.sale.typeName).toBeNull();
    expect(trends?.rent.primary).toBeNull();
    for (let m = 4; m <= 5; m++) await add(m, ids.villa, 21_000);
    expect((await getPriceTrends(ids.area, "villas"))?.sale.typeName).toBe("Villa");
  });
});
