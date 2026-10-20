import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { poiTypes, pois } from "@/db/schema/master-data";
import { properties, propertyPois } from "@/db/schema/properties";
import { auditLog, jobRuns, settings } from "@/db/schema/system";
import { setMapsProvider, type MapsProvider } from "@/features/integrations/google-maps";
import {
  computePropertyPois,
  pendingPoiJob,
  queuePoiCompute,
  refreshStalePois,
} from "@/features/pois/distances";
import {
  recalculatePropertyPois,
  reorderPropertyPois,
  updatePropertyPoi,
} from "@/features/pois/nearby-actions";
import { listPropertyPois } from "@/features/pois/nearby-queries";
import { cronTasks } from "@/jobs/cron";
import { runJob } from "@/jobs/runner";
import { newId } from "@/lib/ids";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const pin = { lng: 55.1403, lat: 25.0805 };
/** About 111 m per 0.001 degree of latitude. */
const north = (km: number) => ({ lng: pin.lng, lat: pin.lat + km / 111.2 });
const south = (km: number) => ({ lng: pin.lng, lat: pin.lat - km / 111.2 });

async function world() {
  const db = await getDb();
  const ids = { school: newId(), metro: newId(), hidden: newId(), listing: newId() };
  await db.insert(poiTypes).values([
    {
      id: ids.school,
      name: "Schools",
      googlePlaceType: "school",
      defaultSearchRadiusM: 3000,
      travelMode: "drive",
      sortOrder: 1,
    },
    {
      id: ids.metro,
      name: "Metro",
      googlePlaceType: "subway_station",
      defaultSearchRadiusM: 1500,
      travelMode: "walk",
      sortOrder: 2,
    },
    { id: ids.hidden, name: "Car washes", showOnProperty: false, sortOrder: 3 },
  ]);
  const place = (
    poiTypeId: string,
    name: string,
    point: { lng: number; lat: number },
    extra = {},
  ) => ({
    id: newId(),
    poiTypeId,
    name,
    point,
    ...extra,
  });
  const rows = {
    a: place(ids.school, "School A", north(0.2)),
    b: place(ids.school, "School B", north(0.5)),
    c: place(ids.school, "School C", north(1.6)),
    d: place(ids.school, "School D", north(2.2)),
    e: place(ids.school, "School E (too far)", north(5)),
    f: place(ids.school, "School F (switched off)", north(0.1), { isActive: false }),
    m1: place(ids.metro, "Marina station", south(0.3), { googlePlaceId: "g-known" }),
    m2: place(ids.metro, "Far station", south(2.2)),
    h: place(ids.hidden, "Car wash", north(0.05)),
  };
  await db.insert(pois).values(Object.values(rows));
  await db.insert(properties).values({
    id: ids.listing,
    reference: "LT-9001",
    title: "Marina apartment",
    slug: "marina-apartment",
    purpose: "sale",
    status: "available",
    point: pin,
  });
  return { db, ids, rows };
}

async function stored(propertyId: string) {
  const db = await getDb();
  return db
    .select({
      name: pois.name,
      straight: propertyPois.straightDistanceM,
      driveSeconds: propertyPois.driveSeconds,
      walkSeconds: propertyPois.walkSeconds,
      isShown: propertyPois.isShown,
      overrideText: propertyPois.overrideText,
      sortOrder: propertyPois.sortOrder,
    })
    .from(propertyPois)
    .innerJoin(pois, eq(pois.id, propertyPois.poiId))
    .where(eq(propertyPois.propertyId, propertyId))
    .orderBy(asc(propertyPois.sortOrder));
}

/** Google stand-in: travel time grows with straight distance; records what was asked. */
function fakeGoogle(overrides: Partial<MapsProvider> = {}) {
  const calls: Array<{ kind: string; detail: unknown }> = [];
  const provider: MapsProvider = {
    geocode: async () => null,
    nearby: async ({ type }) => {
      calls.push({ kind: "nearby", detail: type });
      return type === "subway_station"
        ? [
            {
              googlePlaceId: "g-new",
              name: "Harbour station",
              address: "Harbour",
              point: south(0.6),
              website: null,
            },
            {
              googlePlaceId: "g-known",
              name: "Marina station (Google)",
              address: "",
              point: south(0.3),
              website: null,
            },
            {
              googlePlaceId: "g-far",
              name: "Outside the radius",
              address: "",
              point: south(3),
              website: null,
            },
          ]
        : [];
    },
    routes: async ({ origin, destinations, mode }) => {
      calls.push({ kind: `routes:${mode}`, detail: destinations.length });
      return destinations.map((d, i) => {
        const km = Math.abs(d.lat - origin.lat) * 111.2;
        return {
          destinationIndex: i,
          distanceMeters: Math.round(km * 1300),
          durationSeconds: Math.round(km * (mode === "walk" ? 720 : 120)),
        };
      });
    },
    ...overrides,
  };
  return { provider, calls };
}

describe("POI distances", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    setMapsProvider(null);
    await truncate(
      "property_pois",
      "properties",
      "pois",
      "poi_types",
      "job_runs",
      "audit_log",
      "settings",
      "secrets",
    );
  });
  afterEach(() => setMapsProvider(null));

  it("measures the closest three active places per shown type, straight-line without a key", async () => {
    const { db, ids } = await world();
    const result = await computePropertyPois(db, ids.listing);
    expect(result).toMatchObject({ mode: "straight_line", places: 4, added: 0 });
    expect(result.note).toContain("No Google Maps key");
    const rows = await stored(ids.listing);
    expect(rows.map((r) => r.name)).toEqual(["School A", "School B", "School C", "Marina station"]);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1, 2, 3]);
    expect(rows[0]!.straight).toBeGreaterThan(190);
    expect(rows[0]!.straight).toBeLessThan(210);
    expect(rows.every((r) => r.driveSeconds === null && r.walkSeconds === null)).toBe(true);
  });

  it("with Google: drive for all, walk for walking types and places under 1.5 km, adds new places", async () => {
    const { db, ids } = await world();
    const google = fakeGoogle();
    setMapsProvider(google.provider);
    const result = await computePropertyPois(db, ids.listing);
    expect(result).toMatchObject({ mode: "routes", note: null, places: 5, added: 1 });
    // Schools had three places of their own; only the metro type asked Google.
    expect(google.calls.filter((c) => c.kind === "nearby").map((c) => c.detail)).toEqual([
      "subway_station",
    ]);
    expect(google.calls.find((c) => c.kind === "routes:drive")?.detail).toBe(5);
    // A (0.2 km), B (0.5 km) and the two stations; not C at 1.6 km.
    expect(google.calls.find((c) => c.kind === "routes:walk")?.detail).toBe(4);

    const rows = await stored(ids.listing);
    expect(rows.map((r) => r.name)).toEqual([
      "School A",
      "School B",
      "School C",
      "Marina station",
      "Harbour station",
    ]);
    const c = rows.find((r) => r.name === "School C")!;
    expect(c.driveSeconds).toBeGreaterThan(0);
    expect(c.walkSeconds).toBeNull();
    const [added] = await db.select().from(pois).where(eq(pois.googlePlaceId, "g-new"));
    expect(added).toMatchObject({ poiTypeId: ids.metro, name: "Harbour station", isActive: true });
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "poi.import_nearby"));
    expect(audit).toMatchObject({ actorType: "system", actorId: null });
  });

  it("does not add Google places when the setting is off, and falls back when Routes fails", async () => {
    const { db, ids } = await world();
    await db.insert(settings).values({
      group: "integrations",
      value: {
        googleMaps: {
          enabled: true,
          tileKey: "",
          tileStyleUrl: "",
          importPlaces: true,
          addNearbyPlaces: false,
        },
      },
    });
    const google = fakeGoogle({
      routes: async () => {
        throw new Error("quota exceeded");
      },
    });
    setMapsProvider(google.provider);
    const result = await computePropertyPois(db, ids.listing);
    expect(google.calls.some((c) => c.kind === "nearby")).toBe(false);
    expect(result).toMatchObject({ mode: "straight_line", places: 4, added: 0 });
    expect(result.note).toBe(
      "Google Routes did not answer (quota exceeded), so these are straight-line distances.",
    );
  });

  it("keeps the admin's choices when measuring again and drops places out of range", async () => {
    const { db, ids } = await world();
    await computePropertyPois(db, ids.listing);
    const view = await listPropertyPois(db, ids.listing);
    const byName = (n: string) => view.rows.find((r) => r.name === n)!;
    expect(await updatePropertyPoi({ id: byName("School A").id, isShown: false })).toMatchObject({
      ok: true,
    });
    expect(
      await updatePropertyPoi({
        id: byName("School B").id,
        overrideText: "5 min walk by the canal",
      }),
    ).toMatchObject({ ok: true, data: { isManualOverride: true } });
    const order = [
      byName("Marina station"),
      byName("School C"),
      byName("School A"),
      byName("School B"),
    ];
    expect(
      await reorderPropertyPois({ propertyId: ids.listing, ids: order.map((r) => r.id) }),
    ).toMatchObject({ ok: true });

    // A closer school opens: it is measured, C (now fourth) leaves, choices stay.
    await db.insert(pois).values({ poiTypeId: ids.school, name: "School G", point: north(0.15) });
    await computePropertyPois(db, ids.listing);
    expect(await stored(ids.listing)).toEqual([
      expect.objectContaining({ name: "Marina station", sortOrder: 0 }),
      expect.objectContaining({ name: "School A", sortOrder: 2, isShown: false }),
      expect.objectContaining({
        name: "School B",
        sortOrder: 3,
        overrideText: "5 min walk by the canal",
      }),
      expect.objectContaining({ name: "School G", sortOrder: 4, isShown: true }),
    ]);

    // Far away: everything goes except the place the admin wrote text for.
    await db
      .update(properties)
      .set({ point: { lng: 56.5, lat: 26.5 } })
      .where(eq(properties.id, ids.listing));
    await computePropertyPois(db, ids.listing);
    expect((await stored(ids.listing)).map((r) => r.name)).toEqual(["School B"]);
  });

  it("measures again when the pin moves during a run", async () => {
    const { db, ids } = await world();
    let moved = false;
    setMapsProvider(
      fakeGoogle({
        routes: async ({ destinations }) => {
          if (!moved) {
            moved = true;
            // The admin drags the pin 20 km away while Google is answering.
            await db
              .update(properties)
              .set({ point: { lng: pin.lng, lat: pin.lat + 0.2 } })
              .where(eq(properties.id, ids.listing));
          }
          return destinations.map((_, i) => ({
            destinationIndex: i,
            distanceMeters: 100,
            durationSeconds: 60,
          }));
        },
      }).provider,
    );
    const result = await computePropertyPois(db, ids.listing);
    expect(result.places).toBe(0);
    expect(await stored(ids.listing)).toEqual([]);
  });

  it("queues one run per listing, and the run records its result for the admin", async () => {
    const { db, ids } = await world();
    const first = await queuePoiCompute(db, ids.listing);
    expect(first).toBeTruthy();
    expect(await queuePoiCompute(db, ids.listing)).toBeNull();
    expect(await pendingPoiJob(db, ids.listing)).toBe(first);
    expect(await runJob(first!)).toBe("succeeded");
    expect(await pendingPoiJob(db, ids.listing)).toBeNull();
    const view = await listPropertyPois(db, ids.listing);
    expect(view.rows).toHaveLength(4);
    expect(view.mapsConfigured).toBe(false);
    expect(view.lastRun).toMatchObject({ status: "succeeded", mode: "straight_line", error: null });
    expect(view.lastRun!.note).toContain("No Google Maps key");
  });

  it("refreshes live listings measured more than 90 days ago, once a month", async () => {
    const { db, ids } = await world();
    await computePropertyPois(db, ids.listing);
    const fresh = newId();
    const draft = newId();
    const noPin = newId();
    const never = newId();
    await db.insert(properties).values([
      {
        id: fresh,
        reference: "LT-9002",
        title: "Fresh",
        slug: "fresh",
        purpose: "sale",
        status: "available",
        point: pin,
      },
      {
        id: draft,
        reference: "LT-9003",
        title: "Draft",
        slug: "draft",
        purpose: "sale",
        status: "draft",
        point: pin,
      },
      {
        id: noPin,
        reference: "LT-9004",
        title: "No pin",
        slug: "no-pin",
        purpose: "rent",
        status: "available",
      },
      {
        id: never,
        reference: "LT-9005",
        title: "Never",
        slug: "never",
        purpose: "rent",
        status: "sold",
        point: pin,
      },
    ]);
    await computePropertyPois(db, fresh);
    await computePropertyPois(db, draft);
    const old = new Date(Date.now() - 100 * 86_400_000);
    await db
      .update(propertyPois)
      .set({ computedAt: old })
      .where(eq(propertyPois.propertyId, ids.listing));
    await db
      .update(propertyPois)
      .set({ computedAt: old })
      .where(eq(propertyPois.propertyId, draft));

    expect(await refreshStalePois(db)).toEqual({ queued: 2 });
    const queued = await db
      .select({ payload: jobRuns.payload })
      .from(jobRuns)
      .where(and(eq(jobRuns.name, "poi.compute"), eq(jobRuns.status, "queued")));
    expect(queued.map((q) => q.payload.propertyId).sort()).toEqual([ids.listing, never].sort());

    const task = cronTasks.find((t) => t.name === "poi.refresh")!;
    expect(task.due({ day: 1, hour: 4, minute: 0, weekday: 3 })).toBe(true);
    expect(task.due({ day: 2, hour: 4, minute: 0, weekday: 4 })).toBe(false);
  });

  it("recalculates from the admin, refuses a listing without a pin, and blocks read-only", async () => {
    const { db, ids } = await world();
    const res = await recalculatePropertyPois({ propertyId: ids.listing });
    expect(res.ok).toBe(true);
    expect(res.ok && res.data.rows.map((r) => r.name)).toEqual([
      "School A",
      "School B",
      "School C",
      "Marina station",
    ]);
    expect(res.ok && res.data.lastRun?.status).toBe("succeeded");
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "property.pois_recalculate"));
    expect(audit).toMatchObject({ entityId: ids.listing, actorId: testAdmin.id });

    expect(
      await reorderPropertyPois({
        propertyId: ids.listing,
        ids: [res.ok ? res.data.rows[0]!.id : ""],
      }),
    ).toMatchObject({ ok: false, code: "STALE" });

    await db.update(properties).set({ point: null }).where(eq(properties.id, ids.listing));
    expect(await recalculatePropertyPois({ propertyId: ids.listing })).toMatchObject({
      ok: false,
      code: "NO_PIN",
    });

    adminState.user = { ...testAdmin, readOnly: true };
    expect(
      await updatePropertyPoi({ id: res.ok ? res.data.rows[0]!.id : newId(), isShown: false }),
    ).toMatchObject({ ok: false, code: "READ_ONLY" });
  });
});
