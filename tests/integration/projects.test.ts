import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { developers, facilities, locations, propertyTypes } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { paymentPlans } from "@/db/schema/payment-plans";
import { projectUnitTypes, projects } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import { seoRedirects } from "@/db/schema/seo";
import { deleteDeveloper } from "@/features/developers/actions";
import { deleteLocation } from "@/features/locations/actions";
import { deleteMedia } from "@/features/media/actions";
import { builtInTemplates, planFromTemplate } from "@/features/payment-plans/templates";
import {
  createListingsFromUnitTypes,
  createProject,
  deleteProject,
  saveProject,
  setProjectPublished,
} from "@/features/projects/actions";
import { loadProject } from "@/features/projects/load";
import { listProjects, projectSortable } from "@/features/projects/queries";
import type { ProjectInput } from "@/features/projects/schema";
import { newId } from "@/lib/ids";
import { parseTableParams } from "@/lib/table-params";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const doc = (text: string) => ({
  type: "doc" as const,
  content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text }] }],
});

async function setup() {
  const db = await getDb();
  const ids = {
    developer: newId(),
    other: newId(),
    city: newId(),
    area: newId(),
    type: newId(),
    photo: newId(),
    plan: newId(),
    pdf: newId(),
    pool: newId(),
  };
  await db.insert(developers).values([
    { id: ids.developer, name: "Linden Developments", slug: "linden" },
    { id: ids.other, name: "Palm Builders", slug: "palm-builders" },
  ]);
  await db.insert(locations).values([
    { id: ids.city, level: "city", name: "Coastal City", slug: "coastal-city" },
    { id: ids.area, parentId: ids.city, level: "area", name: "Creek Side", slug: "creek-side" },
  ]);
  await db.insert(propertyTypes).values({ id: ids.type, name: "Apartment", slug: "apartments" });
  await db.insert(media).values([
    {
      id: ids.photo,
      r2Key: "2026/10/cccccccccc/tower.jpg",
      fileName: "tower.jpg",
      mime: "image/jpeg",
      status: "ready",
    },
    {
      id: ids.plan,
      r2Key: "2026/10/dddddddddd/site-plan.png",
      fileName: "site-plan.png",
      mime: "image/png",
      status: "ready",
    },
    {
      id: ids.pdf,
      r2Key: "2026/10/eeeeeeeeee/brochure.pdf",
      fileName: "brochure.pdf",
      mime: "application/pdf",
      status: "ready",
    },
  ]);
  await db.insert(facilities).values({ id: ids.pool, name: "Infinity pool" });
  const res = await createProject({
    name: "The Linden Residences",
    developerId: ids.developer,
    locationId: ids.area,
  });
  if (!res.ok) throw new Error(res.error);
  const loaded = (await loadProject(db, res.data.id))!;
  return {
    db,
    ids,
    id: res.data.id,
    input: loaded.input,
    version: loaded.row.updatedAt.toISOString(),
  };
}

type World = Awaited<ReturnType<typeof setup>>;

const unitA = newId();
const unitB = newId();

function filled(w: World): ProjectInput {
  return {
    ...w.input,
    point: { lng: 55.33, lat: 25.21 },
    status: "under_construction",
    launchDate: "2025-11-01",
    handoverText: "Q4 2027",
    constructionProgress: 35,
    startingPrice: 120_000_000,
    totalUnits: 240,
    unitTypesSummary: "1 to 3 bed apartments",
    description: doc("Homes along the creek."),
    highlights: ["Creek views"],
    media: [
      { mediaId: w.ids.photo, kind: "photo", isCover: true, caption: "", alt: "Tower at dusk" },
    ],
    masterPlanId: w.ids.plan,
    brochureId: w.ids.pdf,
    videoUrl: "https://video.example/linden",
    facilityIds: [w.ids.pool],
    unitTypes: [
      {
        id: unitA,
        name: "1 bed type A",
        beds: 1,
        baths: 1,
        sizeMin: 65,
        sizeMax: 72.5,
        priceFrom: 120_000_000,
        floorPlanId: w.ids.plan,
        availableCount: 30,
      },
      {
        id: unitB,
        name: "2 bed type B",
        beds: 2,
        baths: 2,
        sizeMin: 105,
        sizeMax: 118,
        priceFrom: 185_000_000,
        floorPlanId: null,
        availableCount: 12,
      },
    ],
    paymentPlan: planFromTemplate(builtInTemplates.find((t) => t.name === "60/40")!),
    seoTitle: "The Linden Residences",
  };
}

describe("projects", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate(
      "properties",
      "projects",
      "project_media",
      "project_facilities",
      "project_unit_types",
      "payment_plans",
      "payment_plan_steps",
      "seo_redirects",
      "developers",
      "locations",
      "property_types",
      "facilities",
      "media",
      "audit_log",
      "settings",
    );
  });

  it("creates an unpublished project and refuses unknown references", async () => {
    const w = await setup();
    const [row] = await w.db.select().from(projects).where(eq(projects.id, w.id));
    expect(row).toMatchObject({
      name: "The Linden Residences",
      slug: "the-linden-residences",
      isPublished: false,
      status: "announced",
      currency: "USD",
    });
    expect(
      await createProject({ name: "Ghost", developerId: newId(), locationId: w.ids.area }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { developerId: ["This developer no longer exists."] },
    });
  });

  it("saves every section, keeps unit type ids and lists the project", async () => {
    const w = await setup();
    const data = filled(w);
    const res = await saveProject({ id: w.id, data, expectedUpdatedAt: w.version });
    expect(res.ok).toBe(true);
    const back = (await loadProject(w.db, w.id))!;
    // Plan steps are stored fresh on every save, so only their ids differ.
    const noStepIds = (p: ProjectInput) => ({
      ...p,
      paymentPlan: p.paymentPlan && {
        ...p.paymentPlan,
        steps: p.paymentPlan.steps.map(({ id: _id, ...step }) => step),
      },
    });
    expect(noStepIds(back.input)).toEqual(noStepIds(data));
    expect(back.row.descriptionHtml).toBe("<p>Homes along the creek.</p>");
    expect(back.row.progressUpdatedAt).toBeInstanceOf(Date);
    const progressAt = back.row.progressUpdatedAt!;

    // Same progress: the "updated on" date stays. Removing a unit type unlinks its listings.
    const v = res.ok ? res.data.updatedAt : "";
    await w.db.insert(properties).values({
      reference: "LT-9001",
      title: "Linked",
      slug: "linked",
      purpose: "sale",
      projectId: w.id,
      projectUnitTypeId: unitB,
    });
    const second = await saveProject({
      id: w.id,
      data: { ...data, unitTypes: [data.unitTypes[0]!], highlights: ["Creek views", "Beach"] },
      expectedUpdatedAt: v,
    });
    expect(second.ok).toBe(true);
    const after = (await loadProject(w.db, w.id))!;
    expect(after.row.progressUpdatedAt).toEqual(progressAt);
    expect(after.input.unitTypes.map((u) => u.id)).toEqual([unitA]);
    const [linked] = await w.db
      .select()
      .from(properties)
      .where(eq(properties.reference, "LT-9001"));
    expect(linked!.projectUnitTypeId).toBeNull();
    expect(linked!.projectId).toBe(w.id);

    const list = await listProjects(
      parseTableParams(
        { q: "linden" },
        { sortable: projectSortable, defaultSort: { id: "updated", desc: true } },
      ),
    );
    expect(list.rows[0]).toMatchObject({
      name: "The Linden Residences",
      developerName: "Linden Developments",
      locationName: "Creek Side",
      unitsAvailable: 30,
      unitTypes: 1,
      listings: 1,
      handoverText: "Q4 2027",
      coverUrl: "/media/2026/10/cccccccccc/tower.jpg",
    });
    const byArea = await listProjects(
      parseTableParams(
        { area: w.ids.city },
        { sortable: projectSortable, defaultSort: { id: "updated", desc: true } },
      ),
    );
    expect(byArea.total).toBe(1);
  });

  it("refuses a save based on an old version and unit types of another project", async () => {
    const w = await setup();
    expect(
      await saveProject({
        id: w.id,
        data: { ...w.input, name: "First" },
        expectedUpdatedAt: w.version,
      }),
    ).toMatchObject({ ok: true });
    expect(
      await saveProject({
        id: w.id,
        data: { ...w.input, name: "Second" },
        expectedUpdatedAt: w.version,
      }),
    ).toMatchObject({ ok: false, code: "CONFLICT" });

    const other = await createProject({
      name: "Palm Grove",
      developerId: w.ids.other,
      locationId: w.ids.area,
    });
    const otherId = other.ok ? other.data.id : "";
    const otherRow = (await loadProject(w.db, otherId))!;
    const unit = filled(w).unitTypes[0]!;
    await saveProject({
      id: otherId,
      data: { ...otherRow.input, unitTypes: [unit] },
      expectedUpdatedAt: otherRow.row.updatedAt.toISOString(),
    });
    const current = (await loadProject(w.db, w.id))!;
    expect(
      await saveProject({
        id: w.id,
        data: { ...current.input, unitTypes: [unit] },
        expectedUpdatedAt: current.row.updatedAt.toISOString(),
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { unitTypes: ["A unit type belongs to another project."] },
    });
  });

  it("publishing checks the rules; a published project keeps them; the slug then redirects", async () => {
    const w = await setup();
    const refused = await setProjectPublished({ id: w.id, published: true });
    expect(refused).toMatchObject({ ok: false, code: "PUBLISH_RULES" });
    expect(refused.ok ? {} : refused.fieldErrors).toMatchObject({
      point: ["Drop the pin on the map."],
      media: ["Add at least one photo."],
    });

    // The slug follows the name until the first publish.
    const renamed = await saveProject({
      id: w.id,
      data: { ...filled(w), name: "Linden Creek Residences" },
      expectedUpdatedAt: w.version,
    });
    expect(renamed).toMatchObject({ ok: true, data: { slug: "linden-creek-residences" } });
    const published = await setProjectPublished({ id: w.id, published: true });
    expect(published).toMatchObject({ ok: true, data: { firstPublish: true } });
    let v = published.ok ? published.data.updatedAt : "";
    const current = (await loadProject(w.db, w.id))!;

    expect(
      await saveProject({
        id: w.id,
        data: { ...current.input, point: null },
        expectedUpdatedAt: v,
      }),
    ).toMatchObject({
      ok: false,
      code: "LIVE_RULES",
      fieldErrors: { point: ["Drop the pin on the map."] },
    });
    const plan = current.input.paymentPlan!;
    expect(
      await saveProject({
        id: w.id,
        data: { ...current.input, paymentPlan: { ...plan, steps: plan.steps.slice(0, 2) } },
        expectedUpdatedAt: v,
      }),
    ).toMatchObject({ ok: false, code: "LIVE_RULES" });

    const moved = await saveProject({
      id: w.id,
      data: { ...current.input, name: "Linden Creek", slug: "linden-creek" },
      expectedUpdatedAt: v,
    });
    expect(moved).toMatchObject({ ok: true, data: { slug: "linden-creek" } });
    v = moved.ok ? moved.data.updatedAt : "";
    const redirects = await w.db.select().from(seoRedirects);
    expect(redirects.map((r) => [r.fromPath, r.toPath])).toEqual([
      ["/projects/linden-creek-residences", "/projects/linden-creek"],
    ]);
    expect(await deleteProject({ id: w.id })).toMatchObject({ ok: false, code: "PUBLISHED" });
    expect(await setProjectPublished({ id: w.id, published: false })).toMatchObject({ ok: true });
    const [row] = await w.db.select().from(projects).where(eq(projects.id, w.id));
    expect(row!.publishedAt).toBeInstanceOf(Date);
  });

  it("creates draft listings from unit types with the project's details", async () => {
    const w = await setup();
    await saveProject({ id: w.id, data: filled(w), expectedUpdatedAt: w.version });
    const res = await createListingsFromUnitTypes({
      projectId: w.id,
      propertyTypeId: w.ids.type,
      items: [
        { unitTypeId: unitA, count: 2 },
        { unitTypeId: unitB, count: 1 },
      ],
    });
    expect(res.ok).toBe(true);
    const created = res.ok ? res.data.created : [];
    expect(created.map((c) => c.title)).toEqual([
      "1 bed type A at The Linden Residences",
      "1 bed type A at The Linden Residences",
      "2 bed type B at The Linden Residences",
    ]);
    const rows = await w.db.select().from(properties).where(eq(properties.projectId, w.id));
    const b = rows.find((r) => r.projectUnitTypeId === unitB)!;
    expect(b).toMatchObject({
      status: "draft",
      purpose: "sale",
      completion: "off_plan",
      propertyTypeId: w.ids.type,
      locationId: w.ids.area,
      point: { lng: 55.33, lat: 25.21 },
      beds: 2,
      baths: 2,
      size: 105,
      price: 185_000_000,
      handoverText: "Q4 2027",
      constructionProgress: 35,
      paymentPlanId: null,
      searchText: "Creek Side Coastal City The Linden Residences Apartment",
    });
    expect(new Set(rows.map((r) => r.slug)).size).toBe(3);
    expect(
      await createListingsFromUnitTypes({
        projectId: w.id,
        propertyTypeId: w.ids.type,
        items: [{ unitTypeId: newId(), count: 1 }],
      }),
    ).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("protects what it uses and deletes only when nothing depends on it", async () => {
    const w = await setup();
    await saveProject({ id: w.id, data: filled(w), expectedUpdatedAt: w.version });
    expect(await deleteDeveloper({ id: w.ids.developer })).toMatchObject({
      ok: false,
      code: "IN_USE",
    });
    const location = await deleteLocation({ id: w.ids.area });
    expect(location.ok === false && location.error).toContain("1 projects");
    const file = await deleteMedia({ ids: [w.ids.photo] });
    expect(file).toMatchObject({ ok: true, data: { deleted: 0 } });
    expect(file.ok && file.data.skipped[0]!.usedIn).toContain(
      "Project The Linden Residences: photo",
    );

    await w.db.insert(properties).values({
      reference: "LT-9002",
      title: "Linked",
      slug: "linked-two",
      purpose: "sale",
      projectId: w.id,
    });
    expect(await deleteProject({ id: w.id })).toMatchObject({ ok: false, code: "IN_USE" });
    await w.db.delete(properties).where(eq(properties.reference, "LT-9002"));
    const planId = (await loadProject(w.db, w.id))!.row.paymentPlanId!;
    expect(await deleteProject({ id: w.id })).toMatchObject({ ok: true });
    expect(await w.db.select().from(projects).where(eq(projects.id, w.id))).toEqual([]);
    expect(
      await w.db.select().from(projectUnitTypes).where(eq(projectUnitTypes.projectId, w.id)),
    ).toEqual([]);
    expect(await w.db.select().from(paymentPlans).where(eq(paymentPlans.id, planId))).toEqual([]);
  });

  it("read-only admins cannot change projects", async () => {
    const w = await setup();
    adminState.user = { ...testAdmin, readOnly: true };
    expect(
      await saveProject({
        id: w.id,
        data: { ...w.input, name: "Nope" },
        expectedUpdatedAt: w.version,
      }),
    ).toMatchObject({ ok: false, code: "READ_ONLY" });
    expect(await setProjectPublished({ id: w.id, published: true })).toMatchObject({
      ok: false,
      code: "READ_ONLY",
    });
  });
});
