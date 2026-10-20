/**
 * Pure rules for measuring nearby places (07 §4), kept apart from the database and Google
 * calls so they can be unit tested.
 */

/** Closest places measured per POI type (07 §4.3 "closest N per type, default 3"). */
export const PLACES_PER_TYPE = 3;

/** Walking times are also asked for places this close, whatever the type's travel mode. */
export const WALK_UNDER_M = 1500;

/** Destinations per Google Routes matrix call. */
export const ROUTES_BATCH = 25;

export type Candidate = {
  poiId: string;
  poiTypeId: string;
  name: string;
  point: { lng: number; lat: number };
  straightDistanceM: number;
  travelMode: "drive" | "walk";
};

/** The `perType` closest candidates of each type, nearest first (ties by id, so stable). */
export function closestPerType<
  T extends { poiTypeId: string; poiId: string; straightDistanceM: number },
>(candidates: readonly T[], perType = PLACES_PER_TYPE): T[] {
  const byType = new Map<string, T[]>();
  for (const c of candidates) {
    const list = byType.get(c.poiTypeId) ?? [];
    if (!list.some((x) => x.poiId === c.poiId)) list.push(c);
    byType.set(c.poiTypeId, list);
  }
  const out: T[] = [];
  for (const list of byType.values()) {
    list.sort(
      (a, b) => a.straightDistanceM - b.straightDistanceM || a.poiId.localeCompare(b.poiId),
    );
    out.push(...list.slice(0, perType));
  }
  return out;
}

/** 07 §4.3: walk too when the type is a walking one or the place is under 1.5 km away. */
export const needsWalk = (c: Pick<Candidate, "travelMode" | "straightDistanceM">): boolean =>
  c.travelMode === "walk" || c.straightDistanceM < WALK_UNDER_M;

export function batches<T>(items: readonly T[], size = ROUTES_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type ExistingRow = { poiId: string; sortOrder: number; isManualOverride: boolean };

/**
 * How a new measurement merges with what is stored: places still in range are updated (the
 * admin's "show on site", override text and order stay), new places go after the existing
 * ones in type order then distance, and places out of range are removed unless the admin
 * wrote an override for them.
 */
export function planPoiRows(
  existing: readonly ExistingRow[],
  computed: ReadonlyArray<{ poiId: string; poiTypeId: string; straightDistanceM: number }>,
  typeOrder: ReadonlyMap<string, number>,
): { upserts: Array<{ poiId: string; sortOrder: number | null }>; deletes: string[] } {
  const stored = new Map(existing.map((e) => [e.poiId, e]));
  const inRange = new Set(computed.map((c) => c.poiId));
  let next = existing.length ? Math.max(...existing.map((e) => e.sortOrder)) + 1 : 0;
  const fresh = computed
    .filter((c) => !stored.has(c.poiId))
    .sort(
      (a, b) =>
        (typeOrder.get(a.poiTypeId) ?? 0) - (typeOrder.get(b.poiTypeId) ?? 0) ||
        a.straightDistanceM - b.straightDistanceM ||
        a.poiId.localeCompare(b.poiId),
    );
  const upserts = [
    ...computed
      .filter((c) => stored.has(c.poiId))
      .map((c) => ({ poiId: c.poiId, sortOrder: null })),
    ...fresh.map((c) => ({ poiId: c.poiId, sortOrder: next++ })),
  ];
  const deletes = existing
    .filter((e) => !inRange.has(e.poiId) && !e.isManualOverride)
    .map((e) => e.poiId);
  return { upserts, deletes };
}

/** Same pin, allowing for float noise from PostGIS round trips. */
export const samePoint = (
  a: { lng: number; lat: number } | null | undefined,
  b: { lng: number; lat: number } | null | undefined,
): boolean =>
  !a || !b ? a == b : Math.abs(a.lng - b.lng) < 1e-9 && Math.abs(a.lat - b.lat) < 1e-9;
