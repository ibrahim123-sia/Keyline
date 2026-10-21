import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { developers, facilities, locations, propertyTypes } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { projects } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import {
  countListings,
  landingFor,
  liveListingSlugByRef,
  publicCard,
  relaxSuggestions,
  searchLabels,
  siblingAreas,
} from "@/features/search/page-data";
import { parseSearch } from "@/features/search/params";
import { searchListings } from "@/features/search/query";
import { normalizeQuery, suggest } from "@/features/search/suggest";
import { patchSettings } from "@/features/settings/mutations";
import { newId } from "@/lib/ids";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const actor = { type: "admin" as const, id: testAdmin.id };
const aed = { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 } as const;
let n = 0;

async function world() {
  const db = await getDb();
  await patchSettings(db, "market", { baseCurrency: aed, areaUnit: "sqft" }, actor);
  const ids = {
    apt: newId(),
    villa: newId(),
    dubai: newId(),
    marina: newId(),
    jbr: newId(),
    hills: newId(),
    gate: newId(),
    dev: newId(),
    project: newId(),
    hidden: newId(),
    agent: newId(),
    pool: newId(),
  };
  await db.insert(propertyTypes).values([
    { id: ids.apt, name: "Apartment", slug: "apartments" },
    { id: ids.villa, name: "Villa", slug: "villas" },
  ]);
  await db.insert(locations).values([
    { id: ids.dubai, level: "city", name: "Dubai", slug: "dubai" },
    {
      id: ids.marina,
      parentId: ids.dubai,
      level: "area",
      name: "Dubai Marina",
      slug: "dubai-marina",
      description: "Waterfront towers and a marina walk.",
    },
    {
      id: ids.jbr,
      parentId: ids.dubai,
      level: "area",
      name: "Jumeirah Beach Residence",
      slug: "jbr",
    },
    { id: ids.hills, parentId: ids.dubai, level: "area", name: "Dubai Hills", slug: "dubai-hills" },
    {
      id: ids.gate,
      parentId: ids.marina,
      level: "building",
      name: "Marina Gate",
      slug: "marina-gate",
    },
  ]);
  await db
    .insert(developers)
    .values({ id: ids.dev, name: "Northline Developments", slug: "northline" });
  await db.insert(projects).values([
    {
      id: ids.project,
      developerId: ids.dev,
      name: "Marina Crest",
      slug: "marina-crest",
      locationId: ids.marina,
      isPublished: true,
      publishedAt: new Date(),
    },
    { id: ids.hidden, name: "Marina Secret", slug: "marina-secret", locationId: ids.marina },
  ]);
  await db.insert(agents).values({ id: ids.agent, name: "Sara Khan", slug: "sara-khan" });
  await db.insert(facilities).values({ id: ids.pool, name: "Pool" });
  return { db, ids };
}

type Listing = Partial<typeof properties.$inferInsert>;
async function listing(db: Awaited<ReturnType<typeof getDb>>, values: Listing) {
  const id = newId();
  n++;
  await db.insert(properties).values({
    id,
    reference: `LT-${7000 + n}`,
    title: `Listing ${n}`,
    slug: `listing-${n}-${id.slice(-6)}`,
    purpose: "sale",
    status: "available",
    publishedAt: new Date(Date.UTC(2026, 9, 1 + (n % 20))),
    currency: "AED",
    ...values,
  });
  return id;
}

describe("search pages", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate(
      "properties",
      "projects",
      "developers",
      "facilities",
      "agents",
      "locations",
      "property_types",
      "settings",
      "audit_log",
      "rate_limits",
    );
  });

  it("suggests areas, buildings, projects, developers and references, typos included", async () => {
    const { db, ids } = await world();
    await listing(db, { locationId: ids.marina, reference: "LT-1042", slug: "harbour-loft" });
    await listing(db, {
      locationId: ids.marina,
      reference: "LT-1043",
      status: "draft",
      publishedAt: null,
    });

    const marena = await suggest(normalizeQuery("marena"));
    expect(marena[0]).toMatchObject({
      kind: "location",
      label: "Dubai Marina",
      value: "dubai-marina",
      detail: "Dubai",
    });
    expect(marena.map((s) => [s.kind, s.label])).toEqual(
      expect.arrayContaining([
        ["building", "Marina Gate"],
        ["project", "Marina Crest"],
      ]),
    );
    expect(marena.some((s) => s.label === "Marina Secret")).toBe(false);
    expect(marena.find((s) => s.kind === "project")).toMatchObject({
      value: "p.marina-crest",
      detail: "Northline Developments",
    });

    expect(await suggest(normalizeQuery("Northlin"))).toEqual([
      expect.objectContaining({ kind: "developer", href: "/developers/northline" }),
    ]);
    expect(await suggest(normalizeQuery("lt-104"))).toEqual([
      expect.objectContaining({
        kind: "listing",
        label: "LT-1042",
        href: "/property/harbour-loft",
      }),
    ]);
    expect(await suggest(normalizeQuery("lt1042"))).toHaveLength(1);
    expect(await suggest(normalizeQuery("Júmeirah"))).toEqual([
      expect.objectContaining({ label: "Jumeirah Beach Residence", value: "jbr" }),
    ]);
    expect(await suggest(normalizeQuery("x"))).toEqual([]);
    expect(await suggest(normalizeQuery("qqqqzz"))).toEqual([]);
  });

  it("counts like the list, jumps to references and builds labels", async () => {
    const { db, ids } = await world();
    await listing(db, {
      locationId: ids.gate,
      propertyTypeId: ids.apt,
      reference: "LT-2001",
      slug: "gate-flat",
    });
    await listing(db, { locationId: ids.hills, propertyTypeId: ids.villa, agentId: ids.agent });
    await listing(db, {
      locationId: ids.hills,
      status: "draft",
      publishedAt: null,
      reference: "LT-2003",
    });
    const f = parseSearch({ loc: "dubai" });
    expect(await countListings(f)).toBe((await searchListings(f)).total);
    expect(await countListings(parseSearch({ loc: "dubai-marina" }))).toBe(1);
    expect(await liveListingSlugByRef("lt-2001")).toBe("gate-flat");
    expect(await liveListingSlugByRef("LT-2003")).toBeNull();
    expect(await landingFor("dubai-marina", "apartments")).toMatchObject({
      location: { name: "Dubai Marina", description: "Waterfront towers and a marina walk." },
      type: { name: "Apartment" },
    });
    expect(await landingFor("nowhere", null)).toBeNull();
    expect(await landingFor("dubai-marina", "castles")).toBeNull();
    expect(
      await searchLabels(
        parseSearch({
          loc: ["dubai-marina", "p.marina-crest"],
          type: "villas",
          fac: ids.pool,
          agent: "sara-khan",
        }),
      ),
    ).toEqual({
      places: { "dubai-marina": "Dubai Marina", "p.marina-crest": "Marina Crest" },
      types: { villas: "Villa" },
      facilities: { [ids.pool]: "Pool" },
      badges: {},
      agent: "Sara Khan",
    });
  });

  it("gives the map card only for listings that show in search", async () => {
    const { db, ids } = await world();
    const live = await listing(db, { locationId: ids.marina, title: "Marina view" });
    const draft = await listing(db, { locationId: ids.marina, status: "draft", publishedAt: null });
    const sold = await listing(db, { locationId: ids.marina, status: "sold" });
    expect(await publicCard(live)).toMatchObject({
      id: live,
      title: "Marina view",
      locationName: "Dubai Marina",
    });
    expect(await publicCard(draft)).toBeNull();
    expect(await publicCard(sold)).toBeNull();
  });

  it("says which filter to drop and which nearby areas have homes", async () => {
    const { db, ids } = await world();
    for (let i = 0; i < 3; i++)
      await listing(db, {
        locationId: ids.marina,
        propertyTypeId: ids.apt,
        beds: 2,
        price: 200_000_000,
      });
    await listing(db, {
      locationId: ids.jbr,
      propertyTypeId: ids.villa,
      beds: 5,
      price: 900_000_000,
    });
    await listing(db, {
      locationId: ids.hills,
      propertyTypeId: ids.villa,
      beds: 5,
      price: 700_000_000,
    });

    const f = parseSearch(
      { beds: "5", max: "3000000" },
      { purpose: "sale", loc: ["dubai-marina"] },
    );
    expect(await countListings(f)).toBe(0);
    const labels = await searchLabels(f);
    const units = { currency: aed, areaUnit: "sqft" as const };
    expect(await relaxSuggestions(f, labels, units)).toEqual([
      { label: "5+ beds", href: "/buy/dubai-marina?max=3000000", count: 3 },
    ]);
    expect(
      await siblingAreas(parseSearch({ beds: "5" }, { purpose: "sale", loc: ["dubai-marina"] })),
    ).toEqual([
      { label: "Dubai Hills", href: "/buy/dubai-hills?beds=5", count: 1 },
      { label: "Jumeirah Beach Residence", href: "/buy/jbr?beds=5", count: 1 },
    ]);
  });
});
