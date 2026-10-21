import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { havenDune } from "@/db/seed/presets/haven-dune";
import { getHomePage } from "@/features/cms/queries";
import { sectionInputSchema } from "@/features/cms/sections";
import { seedPreset, type SeedResult } from "@/db/seed/run";
import { parseSearch } from "@/features/search/params";
import { searchListings } from "@/features/search/query";
import { loadSettings } from "@/features/settings/queries";
import { memoryStorage, setStorage } from "@/lib/storage";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const rows = async <T>(query: string) =>
  (await (await getDb()).execute(sql.raw(query))).rows as T[];

describe("demo seed: Haven & Dune", () => {
  let result: SeedResult;

  beforeAll(async () => {
    setStorage(memoryStorage());
    result = await seedPreset(await getDb(), havenDune, {
      reset: true,
      now: new Date("2026-10-20T08:00:00Z"),
    });
  }, 240_000);
  afterAll(async () => {
    setStorage(null);
    // The seed sets the market up (AED, sq ft, "HD" references): later files expect defaults.
    await truncate("settings");
  });

  it("creates the 16 §1 mix of listings, projects, agents and places", async () => {
    expect(result.counts).toMatchObject({
      locations: 9,
      agents: 5,
      developers: 3,
      projects: 4,
      properties: 40,
    });
    const mix = await rows<{ purpose: string; completion: string; n: number }>(
      "select purpose, completion, count(*)::int as n from properties group by 1, 2 order by 1, 2",
    );
    expect(mix).toEqual([
      { purpose: "rent", completion: "ready", n: 10 },
      { purpose: "sale", completion: "off_plan", n: 8 },
      { purpose: "sale", completion: "ready", n: 22 },
    ]);
    const types = await rows<{ slug: string; n: number }>(
      "select t.slug, count(*)::int as n from properties p join property_types t on t.id = p.property_type_id where t.slug in ('offices', 'shops', 'plots') group by 1 order by 1",
    );
    expect(types).toEqual([
      { slug: "offices", n: 2 },
      { slug: "plots", n: 2 },
      { slug: "shops", n: 1 },
    ]);
  });

  it("listings have photos, references, badges, verification and measured places", async () => {
    const [photos] = await rows<{ min: number; max: number }>(
      "select min(n)::int as min, max(n)::int as max from (select count(*) as n from property_media where kind = 'photo' group by property_id) x",
    );
    expect(photos!.min).toBeGreaterThanOrEqual(6);
    expect(photos!.max).toBeLessThanOrEqual(12);
    const refs = await rows<{ reference: string }>(
      "select reference from properties order by reference limit 1",
    );
    expect(refs[0]!.reference).toMatch(/^HD-\d+$/);
    const badges = await rows<{ name: string; n: number }>(
      "select b.name, count(*)::int as n from property_badges pb join badges b on b.id = pb.badge_id group by 1 order by 1",
    );
    const byName = Object.fromEntries(badges.map((b) => [b.name, b.n]));
    expect(byName["Off-plan"]).toBe(8);
    expect(byName["Price reduced"]).toBeGreaterThanOrEqual(3);
    expect(byName.New).toBeGreaterThanOrEqual(1);
    expect(byName.Verified).toBeGreaterThanOrEqual(10);
    const [stale] = await rows<{ n: number }>(
      "select count(*)::int as n from properties where last_verified_at < now() - interval '45 days'",
    );
    expect(stale!.n).toBeGreaterThanOrEqual(3);
    const [measured] = await rows<{ n: number }>(
      "select count(distinct property_id)::int as n from property_pois",
    );
    expect(measured!.n).toBe(40);
    const [projectPlaces] = await rows<{ n: number }>(
      "select count(distinct project_id)::int as n from project_pois",
    );
    expect(projectPlaces!.n).toBe(4);
  });

  it("publishes a home page whose sections all pass the strict section rules", async () => {
    const page = await getHomePage();
    expect(page?.sections.map((x) => x.type)).toEqual([
      "hero_search",
      "promise_strip",
      "featured_listings",
      "projects_showcase",
      "areas_grid",
    ]);
    const [row] = await rows<{ sections: unknown[] }>("select sections from pages where is_home");
    const schema = sectionInputSchema();
    for (const section of row!.sections) expect(schema.safeParse(section).success).toBe(true);
  });

  it("sets the market up and the listings are searchable", async () => {
    const db = await getDb();
    const market = await loadSettings("market", db);
    expect(market).toMatchObject({ areaUnit: "sqft", rentPeriod: "year" });
    expect(market.baseCurrency.code).toBe("AED");
    expect(market.visitorCurrencies.map((c) => c.code)).toEqual(["USD", "EUR", "GBP"]);
    const marina = await searchListings(parseSearch({ loc: "dubai-marina" }));
    expect(marina.total).toBeGreaterThanOrEqual(5);
    const rent = await searchListings(parseSearch({ purpose: "rent" }));
    // Rented listings leave search.
    expect(rent.total).toBe(9);
    expect(result.admins.map((a) => [a.email, a.readOnly])).toEqual([
      ["admin@demo.lintel", false],
      ["staff@demo.lintel", false],
      ["viewer@demo.lintel", true],
    ]);
  });
});
