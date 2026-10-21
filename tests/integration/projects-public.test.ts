import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { developers, locations, poiTypes, pois } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { paymentPlanSteps, paymentPlans } from "@/db/schema/payment-plans";
import { projectMedia, projectPois, projectUnitTypes, projects } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import {
  bedsRange,
  getPublicProject,
  listPublicProjects,
  parseProjectFilters,
  publicProjectFilterOptions,
  type ProjectFilters,
} from "@/features/projects/public";
import { newId } from "@/lib/ids";
import { truncate } from "../helpers/db";

const none: ProjectFilters = { area: null, developer: null, status: null, handover: null };

async function world() {
  const db = await getDb();
  const ids = {
    city: newId(),
    creek: newId(),
    hills: newId(),
    north: newId(),
    calder: newId(),
    linden: newId(),
    palmera: newId(),
    draft: newId(),
    gone: newId(),
    plan: newId(),
    halfPlan: newId(),
    photo: newId(),
    school: newId(),
    hidden: newId(),
  };
  await db.insert(locations).values([
    { id: ids.city, level: "city", name: "Coastal City", slug: "coastal-city" },
    {
      id: ids.creek,
      parentId: ids.city,
      level: "area",
      name: "Creek Harbour",
      slug: "creek-harbour",
    },
    { id: ids.hills, parentId: ids.city, level: "area", name: "Green Hills", slug: "green-hills" },
  ]);
  await db.insert(developers).values([
    { id: ids.north, name: "Northline", slug: "northline" },
    { id: ids.calder, name: "Calder Homes", slug: "calder-homes" },
  ]);
  await db.insert(paymentPlans).values([
    { id: ids.plan, name: "60/40" },
    { id: ids.halfPlan, name: "Unfinished" },
  ]);
  await db.insert(paymentPlanSteps).values([
    { paymentPlanId: ids.plan, stage: "booking", label: "Down payment", percent: 20 },
    { paymentPlanId: ids.plan, stage: "construction", label: "Build", percent: 40 },
    { paymentPlanId: ids.plan, stage: "handover", label: "Keys", percent: 40 },
    { paymentPlanId: ids.halfPlan, stage: "booking", label: "Down payment", percent: 30 },
  ]);
  const base = {
    isPublished: true,
    publishedAt: new Date("2026-09-01T00:00:00Z"),
    currency: "AED",
  };
  await db.insert(projects).values([
    {
      ...base,
      id: ids.linden,
      name: "The Linden",
      slug: "the-linden",
      developerId: ids.north,
      locationId: ids.creek,
      point: { lng: 55.346, lat: 25.201 },
      status: "under_construction",
      handoverDate: "2027-12-31",
      startingPrice: 145_000_000,
      paymentPlanId: ids.plan,
      constructionProgress: 35,
      isFeatured: true,
      descriptionHtml: "<p>Waterfront homes.</p>",
    },
    {
      ...base,
      id: ids.palmera,
      name: "Palmera Grove",
      slug: "palmera-grove",
      developerId: ids.calder,
      locationId: ids.hills,
      status: "announced",
      handoverText: "Q2 2028",
      paymentPlanId: ids.halfPlan,
    },
    { id: ids.draft, name: "Secret Tower", slug: "secret-tower", locationId: ids.creek },
    {
      ...base,
      id: ids.gone,
      name: "Old Project",
      slug: "old-project",
      locationId: ids.creek,
      deletedAt: new Date(),
    },
  ]);
  await db.insert(projectUnitTypes).values([
    {
      projectId: ids.linden,
      name: "1 bed",
      beds: 1,
      sizeMin: 60,
      sizeMax: 75,
      priceFrom: 145_000_000,
      sortOrder: 0,
    },
    {
      projectId: ids.linden,
      name: "3 bed",
      beds: 3,
      sizeMin: 140,
      sizeMax: 160,
      priceFrom: 340_000_000,
      sortOrder: 1,
    },
    { projectId: ids.palmera, name: "Villa", beds: 4 },
  ]);
  await db.insert(media).values({
    id: ids.photo,
    r2Key: "2026/10/aaaaaaaaaa/linden.jpg",
    fileName: "linden.jpg",
    mime: "image/jpeg",
    status: "ready",
    alt: "Towers by the water",
  });
  await db.insert(projectMedia).values({
    projectId: ids.linden,
    mediaId: ids.photo,
    kind: "photo",
    isCover: true,
  });
  const type = newId();
  await db.insert(poiTypes).values({ id: type, name: "School", category: "schools" });
  await db.insert(pois).values([
    { id: ids.school, poiTypeId: type, name: "Harbour School", point: { lng: 55.35, lat: 25.205 } },
    { id: ids.hidden, poiTypeId: type, name: "Far School", point: { lng: 55.4, lat: 25.3 } },
  ]);
  await db.insert(projectPois).values([
    { projectId: ids.linden, poiId: ids.school, straightDistanceM: 620, driveSeconds: 180 },
    { projectId: ids.linden, poiId: ids.hidden, straightDistanceM: 9000, isShown: false },
  ]);
  const listing = (values: Partial<typeof properties.$inferInsert>) =>
    db.insert(properties).values({
      reference: `LT-${Math.floor(Math.random() * 1e6)}`,
      title: "Unit",
      slug: `unit-${newId().slice(-8)}`,
      purpose: "sale",
      completion: "off_plan",
      projectId: ids.linden,
      ...values,
    });
  await listing({ status: "available", publishedAt: new Date(), title: "Linden 1 bed" });
  await listing({ status: "draft", title: "Linden draft" });
  return { db, ids };
}

describe("public projects", () => {
  beforeEach(async () => {
    await truncate(
      "properties",
      "project_pois",
      "project_media",
      "project_unit_types",
      "projects",
      "payment_plans",
      "payment_plan_steps",
      "pois",
      "poi_types",
      "media",
      "developers",
      "locations",
    );
  });

  it("lists published projects only, featured first, with their card details", async () => {
    await world();
    const list = await listPublicProjects(none);
    expect(list.map((p) => p.name)).toEqual(["The Linden", "Palmera Grove"]);
    expect(list[0]).toMatchObject({
      developerName: "Northline",
      locationName: "Creek Harbour",
      handover: "2027-12-31",
      startingPrice: 145_000_000,
      planLabel: "60/40",
      unitTypes: "1 to 3 beds",
      progress: 35,
      cover: { url: "/media/2026/10/aaaaaaaaaa/linden.jpg", alt: "Towers by the water" },
    });
    // An unfinished plan is never advertised.
    expect(list[1]).toMatchObject({ planLabel: null, handover: "Q2 2028", unitTypes: "4 beds" });
  });

  it("filters by area (with what is inside it), developer, status and handover year", async () => {
    await world();
    const names = async (f: Partial<ProjectFilters>) =>
      (await listPublicProjects({ ...none, ...f })).map((p) => p.name);
    expect(await names({ area: "coastal-city" })).toEqual(["The Linden", "Palmera Grove"]);
    expect(await names({ area: "green-hills" })).toEqual(["Palmera Grove"]);
    expect(await names({ developer: "northline" })).toEqual(["The Linden"]);
    expect(await names({ status: "announced" })).toEqual(["Palmera Grove"]);
    expect(await names({ handover: 2027 })).toEqual(["The Linden"]);
    expect(await names({ handover: 2028 })).toEqual(["The Linden", "Palmera Grove"]);
    expect(parseProjectFilters({ area: "Bad slug!", status: "built", handover: "20x" })).toEqual(
      none,
    );
    expect(await publicProjectFilterOptions()).toEqual({
      areas: [
        { slug: "creek-harbour", name: "Creek Harbour" },
        { slug: "green-hills", name: "Green Hills" },
      ],
      developers: [
        { slug: "calder-homes", name: "Calder Homes" },
        { slug: "northline", name: "Northline" },
      ],
      years: [2027, 2028],
    });
  });

  it("loads a published project with units, plan, listings and shown nearby places", async () => {
    await world();
    expect(await getPublicProject("secret-tower")).toBeNull();
    expect(await getPublicProject("old-project")).toBeNull();
    const p = await getPublicProject("the-linden");
    expect(p).toMatchObject({
      name: "The Linden",
      planLabel: "60/40",
      developer: { name: "Northline", slug: "northline" },
      locationPath: [
        { name: "Coastal City", slug: "coastal-city" },
        { name: "Creek Harbour", slug: "creek-harbour" },
      ],
    });
    expect(p!.unitTypes.map((u) => [u.name, u.beds, u.priceFrom])).toEqual([
      ["1 bed", 1, 145_000_000],
      ["3 bed", 3, 340_000_000],
    ]);
    expect(p!.plan!.steps.map((s) => s.percent)).toEqual([20, 40, 40]);
    expect(p!.listings.map((l) => l.title)).toEqual(["Linden 1 bed"]);
    expect(p!.nearby).toEqual([
      expect.objectContaining({
        name: "Harbour School",
        category: "schools",
        distanceM: 620,
        seconds: 180,
        point: { lng: 55.35, lat: 25.205 },
      }),
    ]);
    // Similar: same area or developer only (Palmera Grove shares neither).
    expect(p!.similar).toEqual([]);
    expect((await getPublicProject("palmera-grove"))!.plan).toBeNull();
  });

  it("describes unit mixes", () => {
    expect(bedsRange([0, 1, 2, 3])).toBe("Studio to 3 beds");
    expect(bedsRange([2, 4, null])).toBe("2 to 4 beds");
    expect(bedsRange([1])).toBe("1 bed");
    expect(bedsRange([0])).toBe("Studios");
    expect(bedsRange([null])).toBeNull();
  });
});
