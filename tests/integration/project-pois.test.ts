import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { developers, locations, poiTypes, pois } from "@/db/schema/master-data";
import { projectPois, projects } from "@/db/schema/projects";
import { jobRuns } from "@/db/schema/system";
import { setMapsProvider, type MapsProvider } from "@/features/integrations/google-maps";
import { computeProjectPois, refreshStaleProjectPois } from "@/features/pois/distances";
import { listProjectPois } from "@/features/pois/nearby-queries";
import { createProject, saveProject } from "@/features/projects/actions";
import { loadProject } from "@/features/projects/load";
import {
  recalculateProjectPois,
  reorderProjectPois,
  updateProjectPoi,
} from "@/features/projects/nearby-actions";
import { newId } from "@/lib/ids";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const pin = { lng: 55.3425, lat: 25.2051 };
const north = (km: number) => ({ lng: pin.lng, lat: pin.lat + km / 111.2 });

async function world() {
  const db = await getDb();
  const ids = { school: newId(), developer: newId(), area: newId() };
  await db.insert(poiTypes).values({
    id: ids.school,
    name: "Schools",
    defaultSearchRadiusM: 3000,
    travelMode: "drive",
  });
  await db.insert(pois).values([
    { poiTypeId: ids.school, name: "Creek School", point: north(0.4) },
    { poiTypeId: ids.school, name: "Hill School", point: north(1.2) },
    { poiTypeId: ids.school, name: "Far School", point: north(8) },
  ]);
  await db.insert(developers).values({ id: ids.developer, name: "Linden", slug: "linden" });
  await db.insert(locations).values({ id: ids.area, level: "area", name: "Creek", slug: "creek" });
  const res = await createProject({
    name: "Creek Towers",
    developerId: ids.developer,
    locationId: ids.area,
  });
  if (!res.ok) throw new Error(res.error);
  return { db, ids, projectId: res.data.id };
}

describe("project nearby places", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate(
      "projects",
      "project_pois",
      "pois",
      "poi_types",
      "developers",
      "locations",
      "job_runs",
      "secrets",
      "audit_log",
      "settings",
    );
  });
  afterEach(() => setMapsProvider(null));

  it("measures straight-line distances without a Google key", async () => {
    const { db, projectId } = await world();
    await db.update(projects).set({ point: pin }).where(eq(projects.id, projectId));
    const result = await computeProjectPois(db, projectId);
    expect(result).toMatchObject({ projectId, mode: "straight_line", places: 2, added: 0 });
    expect(result.note).toContain("No Google Maps key");
    const view = await listProjectPois(db, projectId);
    expect(view.rows.map((r) => [r.name, r.driveSeconds])).toEqual([
      ["Creek School", null],
      ["Hill School", null],
    ]);
    expect(view.rows[0]!.straightDistanceM).toBeGreaterThan(380);
    expect(view.rows[0]!.straightDistanceM).toBeLessThan(420);
  });

  it("uses Google travel times when a provider is set", async () => {
    const { db, projectId } = await world();
    await db.update(projects).set({ point: pin }).where(eq(projects.id, projectId));
    const provider: MapsProvider = {
      geocode: async () => null,
      nearby: async () => [],
      routes: async ({ destinations, mode }) =>
        destinations.map((_, i) => ({
          destinationIndex: i,
          durationSeconds: mode === "drive" ? 300 + i * 60 : 900,
          distanceMeters: 1000 + i * 500,
        })),
    };
    setMapsProvider(provider);
    const result = await computeProjectPois(db, projectId);
    expect(result).toMatchObject({ mode: "routes", places: 2 });
    const rows = await db.select().from(projectPois).where(eq(projectPois.projectId, projectId));
    expect(rows.map((r) => r.driveSeconds).sort()).toEqual([300, 360]);
  });

  it("saving a new pin queues one measurement; the admin can recalculate, hide, override and order", async () => {
    const { db, projectId } = await world();
    const loaded = (await loadProject(db, projectId))!;
    const saved = await saveProject({
      id: projectId,
      data: { ...loaded.input, point: pin },
      expectedUpdatedAt: loaded.row.updatedAt.toISOString(),
    });
    expect(saved.ok).toBe(true);
    const jobs = () =>
      db
        .select({ status: jobRuns.status })
        .from(jobRuns)
        .where(eq(jobRuns.dedupeKey, `project_poi.compute:${projectId}`));
    expect(await jobs()).toEqual([{ status: "queued" }]);

    const res = await recalculateProjectPois({ projectId });
    expect(res.ok).toBe(true);
    const rows = res.ok ? res.data.rows : [];
    expect(rows.map((r) => r.name)).toEqual(["Creek School", "Hill School"]);
    expect(res.ok && res.data.lastRun).toMatchObject({
      status: "succeeded",
      mode: "straight_line",
    });

    expect(await updateProjectPoi({ id: rows[0]!.id, isShown: false })).toMatchObject({
      ok: true,
      data: { isShown: false },
    });
    expect(
      await updateProjectPoi({ id: rows[1]!.id, overrideText: "5 min by shuttle" }),
    ).toMatchObject({
      ok: true,
      data: { isManualOverride: true, overrideText: "5 min by shuttle" },
    });
    expect(await reorderProjectPois({ projectId, ids: [rows[1]!.id, rows[0]!.id] })).toMatchObject({
      ok: true,
    });
    expect((await listProjectPois(db, projectId)).rows.map((r) => r.name)).toEqual([
      "Hill School",
      "Creek School",
    ]);
    expect(await reorderProjectPois({ projectId, ids: [rows[1]!.id] })).toMatchObject({
      ok: false,
      code: "STALE",
    });

    adminState.user = { ...testAdmin, readOnly: true };
    expect(await recalculateProjectPois({ projectId })).toMatchObject({
      ok: false,
      code: "READ_ONLY",
    });
  });

  it("recalculating needs a pin", async () => {
    const { projectId } = await world();
    expect(await recalculateProjectPois({ projectId })).toMatchObject({
      ok: false,
      code: "NO_PIN",
    });
  });

  it("the monthly refresh queues published projects with old or missing distances", async () => {
    const { db, ids, projectId } = await world();
    const fresh = await createProject({
      name: "Fresh",
      developerId: ids.developer,
      locationId: ids.area,
    });
    const draft = await createProject({
      name: "Draft",
      developerId: ids.developer,
      locationId: ids.area,
    });
    const freshId = fresh.ok ? fresh.data.id : "";
    const draftId = draft.ok ? draft.data.id : "";
    await db
      .update(projects)
      .set({ point: pin, isPublished: true })
      .where(eq(projects.id, projectId));
    await db
      .update(projects)
      .set({ point: pin, isPublished: true })
      .where(eq(projects.id, freshId));
    await db.update(projects).set({ point: pin }).where(eq(projects.id, draftId));
    await computeProjectPois(db, freshId);
    await db.delete(jobRuns);
    expect(await refreshStaleProjectPois(db)).toEqual({ queued: 1 });
    const queued = await db
      .select({ key: jobRuns.dedupeKey })
      .from(jobRuns)
      .where(and(eq(jobRuns.name, "project_poi.compute"), eq(jobRuns.status, "queued")));
    expect(queued).toEqual([{ key: `project_poi.compute:${projectId}` }]);
  });
});
