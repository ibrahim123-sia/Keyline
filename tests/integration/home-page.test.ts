import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { pages } from "@/db/schema/cms";
import { locations } from "@/db/schema/master-data";
import { properties } from "@/db/schema/properties";
import {
  areaCards,
  featuredListingCards,
  getHomePage,
  heroSearchOptions,
} from "@/features/cms/queries";
import { newId } from "@/lib/ids";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

let n = 0;
async function listing(values: Partial<typeof properties.$inferInsert>) {
  const db = await getDb();
  n++;
  const id = newId();
  await db.insert(properties).values({
    id,
    reference: `LT-${7000 + n}`,
    title: `Home ${n}`,
    slug: `home-${n}-${id.slice(-6)}`,
    purpose: "sale",
    status: "available",
    publishedAt: new Date(Date.UTC(2026, 9, n)),
    currency: "USD",
    ...values,
  });
  return id;
}

describe("home page", () => {
  beforeEach(async () => {
    await truncate("pages", "properties", "locations", "settings");
  });

  it("is the published page marked as home, with broken sections left out", async () => {
    const db = await getDb();
    expect(await getHomePage()).toBeNull();
    await db.insert(pages).values({
      title: "Home",
      slug: "home",
      isHome: true,
      status: "draft",
      sections: [{ id: "a", type: "cta", props: { heading: "Draft" } }],
    });
    expect(await getHomePage()).toBeNull();
    await db.update(pages).set({
      status: "published",
      sections: [
        { id: "a", type: "cta", props: { heading: "Sell with us" } },
        { id: "b", type: "marquee", props: {} },
      ],
    });
    const page = await getHomePage();
    expect(page?.sections.map((s) => s.id)).toEqual(["a"]);
    // Only one home page.
    await expect(
      db.insert(pages).values({ title: "Other", slug: "other", isHome: true, status: "published" }),
    ).rejects.toThrow();
  });

  it("featured listings by source, and area cards count what is inside each area", async () => {
    const db = await getDb();
    const city = newId();
    const marina = newId();
    await db.insert(locations).values([
      { id: city, level: "city", name: "Dubai", slug: "dubai", isFeatured: true },
      {
        id: marina,
        parentId: city,
        level: "area",
        name: "Marina",
        slug: "marina",
        isFeatured: true,
      },
    ]);
    const a = await listing({ isFeatured: true, locationId: marina, price: 100_000_00 });
    const b = await listing({ locationId: marina, purpose: "rent", price: 5_000_00 });
    await listing({ isFeatured: true, status: "draft", publishedAt: null });
    const c = await listing({ locationId: city, price: 300_000_00 });
    const ids = async (source: "featured" | "newest" | "manual" | "filter", extra = {}) =>
      (await featuredListingCards({ source, listingIds: [], filter: "", count: 6, ...extra })).map(
        (x) => x.id,
      );
    expect(await ids("featured")).toEqual([a]);
    // Newest across sale and rent; a filter source narrows it down.
    expect(await ids("newest")).toEqual([c, b, a]);
    expect(await ids("manual", { listingIds: [c, b] })).toEqual([c, b]);
    expect(await ids("filter", { filter: "purpose=rent" })).toEqual([b]);

    const areas = await areaCards({ source: "featured", locationIds: [], count: 4 });
    expect(areas.map((x) => [x.slug, x.forSale, x.forRent])).toEqual([
      ["dubai", 2, 1],
      ["marina", 1, 1],
    ]);
  });

  it("offers budget steps from real prices, never fixed numbers", async () => {
    for (const price of [40_000_000, 55_000_000, 90_000_000, 120_000_000, 250_000_000])
      await listing({ price });
    const { budgets } = await heroSearchOptions();
    expect(budgets.rent).toEqual([]);
    expect(budgets.sale.length).toBeGreaterThan(2);
    expect(budgets.sale.every((v) => v >= 40_000_000 && v <= 260_000_000)).toBe(true);
    expect([...budgets.sale].sort((x, y) => x - y)).toEqual(budgets.sale);
  });
});
