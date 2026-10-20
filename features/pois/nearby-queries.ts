import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { poiTypes, pois, type PoiCategory } from "@/db/schema/master-data";
import { propertyPois } from "@/db/schema/properties";
import { jobRuns } from "@/db/schema/system";
import { mapsConfigured } from "@/features/integrations/google-maps";
import type { PoiComputeResult } from "./distances";

/** One measured place on a listing, as the editor's "Nearby" section shows it. */
export type PropertyPoiView = {
  id: string;
  poiId: string;
  name: string;
  typeName: string;
  typeIcon: string | null;
  category: PoiCategory;
  travelMode: "drive" | "walk";
  straightDistanceM: number;
  driveSeconds: number | null;
  driveDistanceM: number | null;
  walkSeconds: number | null;
  walkDistanceM: number | null;
  computedAt: string;
  isShown: boolean;
  isManualOverride: boolean;
  overrideText: string | null;
  sortOrder: number;
};

/** The latest measurement for the listing (queued, running or finished). */
export type PoiRunView = {
  status: "queued" | "running" | "succeeded" | "failed" | "dead";
  /** When it finished, or was queued if it has not finished yet (ISO). */
  at: string;
  mode: PoiComputeResult["mode"] | null;
  note: string | null;
  error: string | null;
};

export type PropertyPoisView = {
  rows: PropertyPoiView[];
  lastRun: PoiRunView | null;
  /** False: only straight-line distances are possible until a Google key is added. */
  mapsConfigured: boolean;
};

export async function listPropertyPois(db: DbOrTx, propertyId: string): Promise<PropertyPoisView> {
  const rows = await db
    .select({
      row: propertyPois,
      name: pois.name,
      typeName: poiTypes.name,
      typeIcon: poiTypes.icon,
      category: poiTypes.category,
      travelMode: poiTypes.travelMode,
    })
    .from(propertyPois)
    .innerJoin(pois, eq(pois.id, propertyPois.poiId))
    .innerJoin(poiTypes, eq(poiTypes.id, pois.poiTypeId))
    .where(
      and(eq(propertyPois.propertyId, propertyId), eq(propertyPois.agencyId, currentAgencyId())),
    )
    .orderBy(asc(propertyPois.sortOrder), asc(propertyPois.straightDistanceM), asc(pois.name));
  const [last] = await db
    .select()
    .from(jobRuns)
    .where(
      and(
        eq(jobRuns.agencyId, currentAgencyId()),
        eq(jobRuns.name, "poi.compute"),
        sql`${jobRuns.payload}->>'propertyId' = ${propertyId}`,
      ),
    )
    .orderBy(desc(jobRuns.createdAt))
    .limit(1);
  const result = (last?.result ?? null) as Partial<PoiComputeResult> | null;
  return {
    rows: rows.map(({ row, ...p }) => ({
      id: row.id,
      poiId: row.poiId,
      name: p.name,
      typeName: p.typeName,
      typeIcon: p.typeIcon,
      category: p.category,
      travelMode: p.travelMode,
      straightDistanceM: row.straightDistanceM,
      driveSeconds: row.driveSeconds,
      driveDistanceM: row.driveDistanceM,
      walkSeconds: row.walkSeconds,
      walkDistanceM: row.walkDistanceM,
      computedAt: row.computedAt.toISOString(),
      isShown: row.isShown,
      isManualOverride: row.isManualOverride,
      overrideText: row.overrideText,
      sortOrder: row.sortOrder,
    })),
    lastRun: last
      ? {
          status: last.status,
          at: (last.finishedAt ?? last.createdAt).toISOString(),
          mode: result?.mode ?? null,
          note: result?.note ?? null,
          error: last.status === "succeeded" ? null : last.lastError,
        }
      : null,
    mapsConfigured: await mapsConfigured(db),
  };
}
