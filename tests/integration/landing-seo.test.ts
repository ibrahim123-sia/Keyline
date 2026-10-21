import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { locations, propertyTypes } from "@/db/schema/master-data";
import { properties } from "@/db/schema/properties";
import { searchMetadata } from "@/features/search/metadata";
import { typeLandingLinks } from "@/features/seo/landing-links";
import { newId } from "@/lib/ids";
import { truncate } from "../helpers/db";

let n = 0;
async function listings(count: number, values: Partial<typeof properties.$inferInsert>) {
  const db = await getDb();
  for (let i = 0; i < count; i++) {
    n++;
    await db.insert(properties).values({
      reference: `LT-${9000 + n}`,
      title: `Listing ${n}`,
      slug: `landing-${n}`,
      purpose: "sale",
      status: "available",
      publishedAt: new Date("2026-10-01T00:00:00.000Z"),
      currency: "AED",
      ...values,
    });
  }
}

const robotsFor = async (preset: Parameters<typeof searchMetadata>[0]) =>
  (await searchMetadata(preset, Promise.resolve({}))).robots;

describe("SEO landing pages", () => {
  const ids = { city: newId(), harbour: newId(), villa: newId(), apt: newId() };
  beforeEach(async () => {
    n = 0;
    await truncate("properties", "locations", "property_types", "settings");
    const db = await getDb();
    await db.insert(locations).values([
      { id: ids.city, level: "city", name: "Coastal City", slug: "coastal-city" },
      {
        id: ids.harbour,
        parentId: ids.city,
        level: "area",
        name: "Old Harbour",
        slug: "old-harbour",
      },
    ]);
    await db.insert(propertyTypes).values([
      { id: ids.villa, name: "Villa", slug: "villas" },
      { id: ids.apt, name: "Apartment", slug: "apartments" },
    ]);
    await listings(5, { locationId: ids.harbour, propertyTypeId: ids.villa });
    await listings(3, { locationId: ids.harbour, propertyTypeId: ids.apt });
  });

  it("indexes area pages from 3 listings and area x type pages from 5", async () => {
    expect(await robotsFor({ purpose: "sale", loc: ["old-harbour"] })).toBeUndefined();
    expect(
      await robotsFor({ purpose: "sale", loc: ["old-harbour"], type: ["villas"] }),
    ).toBeUndefined();
    expect(
      await robotsFor({ purpose: "sale", loc: ["old-harbour"], type: ["apartments"] }),
    ).toEqual({
      index: false,
      follow: true,
    });
    // Thin: nothing to rent there.
    expect(await robotsFor({ purpose: "rent", loc: ["old-harbour"] })).toEqual({
      index: false,
      follow: true,
    });
  });

  it("links an area page to the type pages that count as generated", async () => {
    expect(await typeLandingLinks("coastal-city", "sale")).toEqual([
      { slug: "villas", name: "Villa", count: 5 },
    ]);
    expect(await typeLandingLinks("old-harbour", "rent")).toEqual([]);
  });
});
