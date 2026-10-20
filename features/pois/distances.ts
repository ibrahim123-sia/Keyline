import "server-only";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import type { Db, DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { poiTypes, pois } from "@/db/schema/master-data";
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
 * Distances and travel times from a listing to nearby places (07 §4). Runs as the
 * `poi.compute` job (pin moved, "Recalculate", monthly refresh), never on a page view.
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

const NO_KEY_NOTE =
  "No Google Maps key, so these are straight-line distances. Add the key in Settings -> Integrations for travel times.";

const systemActor = { type: "system", id: null } as const;

class PinMoved extends Error {}

type Route = { seconds: number | null; meters: number | null };

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
  propertyId: string,
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
          after: { poiTypeId: type.id, imported: rows.map((r) => r.name), propertyId },
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

async function measureOnce(db: Db, propertyId: string, now: Date): Promise<PoiComputeResult> {
  const [listing] = await db
    .select({ point: properties.point, deletedAt: properties.deletedAt })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.agencyId, currentAgencyId())));
  if (!listing)
    return {
      propertyId,
      mode: "no_pin",
      note: "This listing no longer exists.",
      places: 0,
      added: 0,
    };
  const pin = listing.point;
  if (!pin) {
    // No pin, nothing to measure: keep only what the admin wrote by hand.
    await db
      .delete(propertyPois)
      .where(
        and(eq(propertyPois.propertyId, propertyId), eq(propertyPois.isManualOverride, false)),
      );
    return {
      propertyId,
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
      const google = await addGooglePlaces(
        db,
        provider,
        pin,
        candidates,
        PLACES_PER_TYPE,
        propertyId,
      );
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
    const [current] = await tx
      .select({ point: properties.point })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .for("update");
    if (!samePoint(current?.point, pin)) throw new PinMoved();
    const existing = await tx
      .select({
        poiId: propertyPois.poiId,
        sortOrder: propertyPois.sortOrder,
        isManualOverride: propertyPois.isManualOverride,
      })
      .from(propertyPois)
      .where(eq(propertyPois.propertyId, propertyId));
    const plan = planPoiRows(existing, candidates, typeOrder);
    const byId = new Map(candidates.map((c) => [c.poiId, c]));
    for (const row of plan.upserts) {
      const c = byId.get(row.poiId)!;
      const measured = {
        straightDistanceM: c.straightDistanceM,
        driveSeconds: drive.get(c.poiId)?.seconds ?? null,
        driveDistanceM: drive.get(c.poiId)?.meters ?? null,
        walkSeconds: walk.get(c.poiId)?.seconds ?? null,
        walkDistanceM: walk.get(c.poiId)?.meters ?? null,
        computedAt: now,
      };
      await tx
        .insert(propertyPois)
        .values({ propertyId, poiId: c.poiId, sortOrder: row.sortOrder ?? 0, ...measured })
        .onConflictDoUpdate({
          target: [propertyPois.propertyId, propertyPois.poiId],
          set: measured,
        });
    }
    if (plan.deletes.length)
      await tx
        .delete(propertyPois)
        .where(
          and(eq(propertyPois.propertyId, propertyId), inArray(propertyPois.poiId, plan.deletes)),
        );
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(propertyPois)
      .where(eq(propertyPois.propertyId, propertyId));
    return count?.n ?? 0;
  });

  return {
    propertyId,
    mode: candidates.length === 0 && provider ? "routes" : mode,
    note: notes.length ? notes.join(" ") : null,
    places,
    added,
  };
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
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await measureOnce(db, propertyId, now);
      revalidateTag(tags.listing(propertyId), { expire: 0 });
      return result;
    } catch (err) {
      if (!(err instanceof PinMoved) || attempt >= 3) throw err;
    }
  }
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
