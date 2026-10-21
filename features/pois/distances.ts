import "server-only";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { poiTypes, pois } from "@/db/schema/master-data";
import { projectPois, projects } from "@/db/schema/projects";
import { properties, propertyPois } from "@/db/schema/properties";
import { jobRuns } from "@/db/schema/system";
import {
  getMapsProvider,
  MapsNotConfiguredError,
  type MapsProvider,
} from "@/features/integrations/google-maps";
import { liveStatuses } from "@/features/properties/status";
import { loadSettings } from "@/features/settings/queries";
import { enqueue } from "@/jobs/enqueue";
import { defineJob } from "@/jobs/types";
import { writeAudit } from "@/lib/audit";
import { tags } from "@/lib/cache-tags";
import { haversineMeters, type LngLat } from "@/lib/geo";
import { expireTags } from "@/lib/expire-tags";
import {
  batches,
  closestPerType,
  needsWalk,
  PLACES_PER_TYPE,
  planPoiRows,
  samePoint,
  type Candidate,
} from "./distance-rules";

/**
 * Distances and travel times from a listing (or a project, 07 §6) to nearby places (07 §4).
 * Runs as the `poi.compute` / `project_poi.compute` jobs (pin moved, "Recalculate", monthly
 * refresh), never on a page view.
 */

export type PoiComputeResult = {
  propertyId: string;
  /** "routes": Google travel times; "straight_line": distances only; "no_pin": nothing to measure. */
  mode: "routes" | "straight_line" | "no_pin";
  /** Why travel times are missing or partial, for the admin; null when all went well. */
  note: string | null;
  /** Places stored for the listing after this run. */
  places: number;
  /** Places found on Google and added to Setup -> Places. */
  added: number;
};

/** The same for a project (07 §6). */
export type ProjectPoiComputeResult = Omit<PoiComputeResult, "propertyId"> & { projectId: string };

type Measurement = Omit<PoiComputeResult, "propertyId">;

const NO_KEY_NOTE =
  "No Google Maps key, so these are straight-line distances. Add the key in Settings -> Integrations for travel times.";

const systemActor = { type: "system", id: null } as const;

class PinMoved extends Error {}

type Route = { seconds: number | null; meters: number | null };

type Measured = {
  straightDistanceM: number;
  driveSeconds: number | null;
  driveDistanceM: number | null;
  walkSeconds: number | null;
  walkDistanceM: number | null;
  computedAt: Date;
};

/** Where an owner's measured places are kept: listings in property_pois, projects in project_pois. */
type OwnerStore = {
  kind: "property" | "project";
  missing: string;
  /** The owner's pin (undefined when it no longer exists); `lock` inside the write transaction. */
  point(db: DbOrTx, id: string, lock?: boolean): Promise<{ point: LngLat | null } | undefined>;
  existing(
    db: DbOrTx,
    id: string,
  ): Promise<Array<{ poiId: string; sortOrder: number; isManualOverride: boolean }>>;
  upsert(db: DbOrTx, id: string, poiId: string, sortOrder: number, m: Measured): Promise<void>;
  remove(db: DbOrTx, id: string, poiIds: string[]): Promise<void>;
  /** No pin: keep only what the admin wrote by hand. */
  removeMeasured(db: DbOrTx, id: string): Promise<void>;
  count(db: DbOrTx, id: string): Promise<number>;
};

const propertyStore: OwnerStore = {
  kind: "property",
  missing: "This listing no longer exists.",
  async point(db, id, lock) {
    const q = db
      .select({ point: properties.point })
      .from(properties)
      .where(and(eq(properties.id, id), eq(properties.agencyId, currentAgencyId())));
    const [row] = lock ? await q.for("update") : await q;
    return row;
  },
  existing: (db, id) =>
    db
      .select({
        poiId: propertyPois.poiId,
        sortOrder: propertyPois.sortOrder,
        isManualOverride: propertyPois.isManualOverride,
      })
      .from(propertyPois)
      .where(eq(propertyPois.propertyId, id)),
  async upsert(db, id, poiId, sortOrder, m) {
    await db
      .insert(propertyPois)
      .values({ propertyId: id, poiId, sortOrder, ...m })
      .onConflictDoUpdate({ target: [propertyPois.propertyId, propertyPois.poiId], set: m });
  },
  async remove(db, id, poiIds) {
    await db
      .delete(propertyPois)
      .where(and(eq(propertyPois.propertyId, id), inArray(propertyPois.poiId, poiIds)));
  },
  async removeMeasured(db, id) {
    await db
      .delete(propertyPois)
      .where(and(eq(propertyPois.propertyId, id), eq(propertyPois.isManualOverride, false)));
  },
  async count(db, id) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(propertyPois)
      .where(eq(propertyPois.propertyId, id));
    return row?.n ?? 0;
  },
};

const projectStore: OwnerStore = {
  kind: "project",
  missing: "This project no longer exists.",
  async point(db, id, lock) {
    const q = db
      .select({ point: projects.point })
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.agencyId, currentAgencyId())));
    const [row] = lock ? await q.for("update") : await q;
    return row;
  },
  existing: (db, id) =>
    db
      .select({
        poiId: projectPois.poiId,
        sortOrder: projectPois.sortOrder,
        isManualOverride: projectPois.isManualOverride,
      })
      .from(projectPois)
      .where(eq(projectPois.projectId, id)),
  async upsert(db, id, poiId, sortOrder, m) {
    await db
      .insert(projectPois)
      .values({ projectId: id, poiId, sortOrder, ...m })
      .onConflictDoUpdate({ target: [projectPois.projectId, projectPois.poiId], set: m });
  },
  async remove(db, id, poiIds) {
    await db
      .delete(projectPois)
      .where(and(eq(projectPois.projectId, id), inArray(projectPois.poiId, poiIds)));
  },
  async removeMeasured(db, id) {
    await db
      .delete(projectPois)
      .where(and(eq(projectPois.projectId, id), eq(projectPois.isManualOverride, false)));
  },
  async count(db, id) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(projectPois)
      .where(eq(projectPois.projectId, id));
    return row?.n ?? 0;
  },
};

/** Own active places within each type's search radius, closest `perType` per type (PostGIS). */
async function ownCandidates(db: DbOrTx, pin: LngLat, perType: number): Promise<Candidate[]> {
  const result = await db.execute<{
    poi_id: string;
    poi_type_id: string;
    name: string;
    lng: number;
    lat: number;
    distance: number;
    travel_mode: "drive" | "walk";
  }>(sql`
    with pin as (select ST_SetSRID(ST_MakePoint(${pin.lng}, ${pin.lat}), 4326)::geography as g)
    select poi_id, poi_type_id, name, lng, lat, distance, travel_mode from (
      select p.id as poi_id, p.poi_type_id, p.name,
        ST_X(p.point) as lng, ST_Y(p.point) as lat,
        ST_Distance(p.point::geography, pin.g) as distance,
        t.travel_mode,
        row_number() over (
          partition by p.poi_type_id order by ST_Distance(p.point::geography, pin.g), p.id
        ) as rn
      from ${pois} p
      join ${poiTypes} t on t.id = p.poi_type_id
      cross join pin
      where p.agency_id = ${currentAgencyId()}
        and t.agency_id = ${currentAgencyId()}
        and p.is_active
        and t.show_on_property
        and ST_DWithin(p.point::geography, pin.g, t.default_search_radius_m)
    ) ranked
    where rn <= ${perType}
    order by poi_type_id, distance`);
  return result.rows.map((r) => ({
    poiId: r.poi_id,
    poiTypeId: r.poi_type_id,
    name: r.name,
    point: { lng: Number(r.lng), lat: Number(r.lat) },
    straightDistanceM: Math.round(Number(r.distance)),
    travelMode: r.travel_mode,
  }));
}

/**
 * For types with fewer than `perType` places nearby: ask Google Places and add what it finds
 * to the agency's places (when Settings -> Integrations allows it). Places the agency already
 * has, or switched off, are not added again.
 */
async function addGooglePlaces(
  db: Db,
  provider: MapsProvider,
  pin: LngLat,
  have: Candidate[],
  perType: number,
  /** For the audit entry: { propertyId } or { projectId }. */
  owner: Record<string, string>,
): Promise<{ candidates: Candidate[]; added: number; note: string | null }> {
  const types = await db
    .select()
    .from(poiTypes)
    .where(
      and(
        eq(poiTypes.agencyId, currentAgencyId()),
        eq(poiTypes.showOnProperty, true),
        isNotNull(poiTypes.googlePlaceType),
      ),
    );
  const counts = new Map<string, number>();
  for (const c of have) counts.set(c.poiTypeId, (counts.get(c.poiTypeId) ?? 0) + 1);
  const found: Candidate[] = [];
  let added = 0;
  for (const type of types.filter((t) => (counts.get(t.id) ?? 0) < perType)) {
    let results;
    try {
      results = await provider.nearby({
        type: type.googlePlaceType!,
        center: pin,
        radiusM: type.defaultSearchRadiusM,
        max: 10,
      });
    } catch (err) {
      return {
        candidates: found,
        added,
        note: `Google Places did not answer (${(err as Error).message}), so only your own places were measured.`,
      };
    }
    if (results.length === 0) continue;
    const known = await db
      .select({ googlePlaceId: pois.googlePlaceId })
      .from(pois)
      .where(
        and(
          eq(pois.agencyId, currentAgencyId()),
          inArray(
            pois.googlePlaceId,
            results.map((r) => r.googlePlaceId),
          ),
        ),
      );
    const skip = new Set(known.map((k) => k.googlePlaceId));
    const fresh = results.filter(
      (r) =>
        !skip.has(r.googlePlaceId) && haversineMeters(pin, r.point) <= type.defaultSearchRadiusM,
    );
    if (fresh.length === 0) continue;
    const inserted = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(pois)
        .values(
          fresh.map((r) => ({
            poiTypeId: type.id,
            name: r.name,
            address: r.address || null,
            point: r.point,
            googlePlaceId: r.googlePlaceId,
            website: r.website,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: pois.id, name: pois.name, point: pois.point });
      if (rows.length)
        await writeAudit(tx, {
          actor: systemActor,
          action: "poi.import_nearby",
          entityType: "poi",
          after: { poiTypeId: type.id, imported: rows.map((r) => r.name), ...owner },
        });
      return rows;
    });
    added += inserted.length;
    for (const row of inserted) {
      found.push({
        poiId: row.id,
        poiTypeId: type.id,
        name: row.name,
        point: row.point,
        straightDistanceM: Math.round(haversineMeters(pin, row.point)),
        travelMode: type.travelMode,
      });
    }
  }
  return { candidates: found, added, note: null };
}

/** Google Routes for all destinations, in batches. */
async function routeAll(
  provider: MapsProvider,
  pin: LngLat,
  destinations: Candidate[],
  mode: "drive" | "walk",
): Promise<Map<string, Route>> {
  const out = new Map<string, Route>();
  for (const batch of batches(destinations)) {
    const results = await provider.routes({
      origin: pin,
      destinations: batch.map((d) => d.point),
      mode,
    });
    for (const r of results) {
      const dest = batch[r.destinationIndex];
      if (dest) out.set(dest.poiId, { seconds: r.durationSeconds, meters: r.distanceMeters });
    }
  }
  return out;
}

async function measureOnce(
  db: Db,
  store: OwnerStore,
  ownerId: string,
  now: Date,
): Promise<Measurement> {
  const owner = await store.point(db, ownerId);
  if (!owner)
    return {
      mode: "no_pin",
      note: store.missing,
      places: 0,
      added: 0,
    };
  const pin = owner.point;
  if (!pin) {
    // No pin, nothing to measure: keep only what the admin wrote by hand.
    await store.removeMeasured(db, ownerId);
    return {
      mode: "no_pin",
      note: "Drop the pin on the map to measure nearby places.",
      places: 0,
      added: 0,
    };
  }

  const notes: string[] = [];
  let candidates = await ownCandidates(db, pin, PLACES_PER_TYPE);
  let added = 0;
  let provider: MapsProvider | null = null;
  try {
    provider = await getMapsProvider(db);
  } catch (err) {
    if (!(err instanceof MapsNotConfiguredError)) throw err;
    notes.push(NO_KEY_NOTE);
  }

  if (provider) {
    const integrations = await loadSettings("integrations", db);
    if (integrations.googleMaps.addNearbyPlaces) {
      const google = await addGooglePlaces(db, provider, pin, candidates, PLACES_PER_TYPE, {
        [`${store.kind}Id`]: ownerId,
      });
      added = google.added;
      if (google.note) notes.push(google.note);
      candidates = closestPerType([...candidates, ...google.candidates]);
    }
  }

  let mode: PoiComputeResult["mode"] = "straight_line";
  let drive = new Map<string, Route>();
  let walk = new Map<string, Route>();
  if (provider && candidates.length > 0) {
    try {
      drive = await routeAll(provider, pin, candidates, "drive");
      mode = "routes";
      try {
        walk = await routeAll(provider, pin, candidates.filter(needsWalk), "walk");
      } catch (err) {
        notes.push(
          `Walking times are missing: Google Routes did not answer (${(err as Error).message}).`,
        );
      }
    } catch (err) {
      notes.push(
        `Google Routes did not answer (${(err as Error).message}), so these are straight-line distances.`,
      );
    }
  }

  const typeRows = await db
    .select({ id: poiTypes.id, sortOrder: poiTypes.sortOrder })
    .from(poiTypes)
    .where(eq(poiTypes.agencyId, currentAgencyId()));
  const typeOrder = new Map(typeRows.map((t) => [t.id, t.sortOrder]));

  const places = await db.transaction(async (tx) => {
    // Written only if the pin is where it was when we measured; otherwise measure again.
    const current = await store.point(tx, ownerId, true);
    if (!samePoint(current?.point, pin)) throw new PinMoved();
    const existing = await store.existing(tx, ownerId);
    const plan = planPoiRows(existing, candidates, typeOrder);
    const byId = new Map(candidates.map((c) => [c.poiId, c]));
    for (const row of plan.upserts) {
      const c = byId.get(row.poiId)!;
      await store.upsert(tx, ownerId, c.poiId, row.sortOrder ?? 0, {
        straightDistanceM: c.straightDistanceM,
        driveSeconds: drive.get(c.poiId)?.seconds ?? null,
        driveDistanceM: drive.get(c.poiId)?.meters ?? null,
        walkSeconds: walk.get(c.poiId)?.seconds ?? null,
        walkDistanceM: walk.get(c.poiId)?.meters ?? null,
        computedAt: now,
      });
    }
    if (plan.deletes.length) await store.remove(tx, ownerId, plan.deletes);
    return store.count(tx, ownerId);
  });

  return {
    mode: candidates.length === 0 && provider ? "routes" : mode,
    note: notes.length ? notes.join(" ") : null,
    places,
    added,
  };
}

/** Measures; if the pin moves while this runs, measures again (up to three times). */
async function measureSettled(
  db: Db,
  store: OwnerStore,
  ownerId: string,
  now: Date,
): Promise<Measurement> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await measureOnce(db, store, ownerId, now);
    } catch (err) {
      if (!(err instanceof PinMoved) || attempt >= 3) throw err;
    }
  }
}

/**
 * Measures nearby places for one listing (07 §4.1-4.5, 4.8). If the pin moves while this
 * runs, it measures again (up to three times) so the stored distances match the pin.
 */
export async function computePropertyPois(
  db: Db,
  propertyId: string,
  now = new Date(),
): Promise<PoiComputeResult> {
  const result = await measureSettled(db, propertyStore, propertyId, now);
  expireTags(tags.listing(propertyId));
  return { propertyId, ...result };
}

/** The same for a project (07 §6: nearby places on the project page). */
export async function computeProjectPois(
  db: Db,
  projectId: string,
  now = new Date(),
): Promise<ProjectPoiComputeResult> {
  const result = await measureSettled(db, projectStore, projectId, now);
  expireTags(tags.project(projectId));
  return { projectId, ...result };
}

export const poiComputeJob = defineJob({
  name: "poi.compute",
  payload: z.object({ propertyId: z.uuid() }),
  maxAttempts: 3,
  run: ({ propertyId }, ctx) => computePropertyPois(ctx.db, propertyId),
});

const dedupeKey = (propertyId: string) => `poi.compute:${propertyId}`;

/**
 * Queues a measurement for a listing (pin dropped or moved). A run that is already waiting
 * for that listing covers it, so this returns null then. Safe inside a transaction: the job
 * starts after the commit.
 */
export function queuePoiCompute(db: DbOrTx, propertyId: string): Promise<string | null> {
  return enqueue(
    "poi.compute",
    { propertyId },
    { db, dedupeKey: dedupeKey(propertyId), maxAttempts: 3 },
  );
}

/** The waiting or running measurement for a listing, if any. */
export async function pendingPoiJob(db: DbOrTx, propertyId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: jobRuns.id })
    .from(jobRuns)
    .where(
      and(
        eq(jobRuns.dedupeKey, dedupeKey(propertyId)),
        inArray(jobRuns.status, ["queued", "running"]),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/**
 * Monthly refresh (07 §4.7): live listings with a pin whose distances are older than 90 days
 * (or were never measured) are measured again, at most `limit` per run to respect quotas.
 */
export async function refreshStalePois(
  db: DbOrTx,
  now = new Date(),
  limit = 500,
): Promise<{ queued: number }> {
  const cutoff = new Date(now.getTime() - 90 * 86_400_000);
  const rows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.agencyId, currentAgencyId()),
        sql`${properties.deletedAt} is null`,
        isNotNull(properties.point),
        inArray(properties.status, [...liveStatuses]),
        sql`coalesce((select max(${propertyPois.computedAt}) from ${propertyPois} where ${propertyPois.propertyId} = ${properties.id}), '-infinity'::timestamptz) < ${cutoff}`,
      ),
    )
    .orderBy(properties.id)
    .limit(limit);
  let queued = 0;
  for (const row of rows) if (await queuePoiCompute(db, row.id)) queued++;
  return { queued };
}

/* Projects (07 §6) ------------------------------------------------------------ */

export const projectPoiComputeJob = defineJob({
  name: "project_poi.compute",
  payload: z.object({ projectId: z.uuid() }),
  maxAttempts: 3,
  run: ({ projectId }, ctx) => computeProjectPois(ctx.db, projectId),
});

const projectDedupeKey = (projectId: string) => `project_poi.compute:${projectId}`;

/** Queues a measurement for a project (pin dropped or moved); null if one is already waiting. */
export function queueProjectPoiCompute(db: DbOrTx, projectId: string): Promise<string | null> {
  return enqueue(
    "project_poi.compute",
    { projectId },
    { db, dedupeKey: projectDedupeKey(projectId), maxAttempts: 3 },
  );
}

/** The waiting or running measurement for a project, if any. */
export async function pendingProjectPoiJob(db: DbOrTx, projectId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: jobRuns.id })
    .from(jobRuns)
    .where(
      and(
        eq(jobRuns.dedupeKey, projectDedupeKey(projectId)),
        inArray(jobRuns.status, ["queued", "running"]),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/** Monthly refresh for published projects with a pin, as for listings (07 §4.7). */
export async function refreshStaleProjectPois(
  db: DbOrTx,
  now = new Date(),
  limit = 200,
): Promise<{ queued: number }> {
  const cutoff = new Date(now.getTime() - 90 * 86_400_000);
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.agencyId, currentAgencyId()),
        sql`${projects.deletedAt} is null`,
        eq(projects.isPublished, true),
        isNotNull(projects.point),
        sql`coalesce((select max(${projectPois.computedAt}) from ${projectPois} where ${projectPois.projectId} = ${projects.id}), '-infinity'::timestamptz) < ${cutoff}`,
      ),
    )
    .orderBy(projects.id)
    .limit(limit);
  let queued = 0;
  for (const row of rows) if (await queueProjectPoiCompute(db, row.id)) queued++;
  return { queued };
}
