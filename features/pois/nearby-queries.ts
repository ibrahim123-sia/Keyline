import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { poiTypes, pois, type PoiCategory } from "@/db/schema/master-data";
import { projectPois } from "@/db/schema/projects";
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

type StoredPoi = {
  id: string;
  poiId: string;
  straightDistanceM: number;
  driveSeconds: number | null;
  driveDistanceM: number | null;
  walkSeconds: number | null;
  walkDistanceM: number | null;
  computedAt: Date;
  isShown: boolean;
  isManualOverride: boolean;
  overrideText: string | null;
  sortOrder: number;
};

type PoiInfo = {
  name: string;
  typeName: string;
  typeIcon: string | null;
  category: PoiCategory;
  travelMode: "drive" | "walk";
};

function toView(row: StoredPoi, p: PoiInfo): PropertyPoiView {
  return {
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
  };
}

/** The latest measurement job for an owner (payload key propertyId or projectId). */
async function lastRun(
  db: DbOrTx,
  job: "poi.compute" | "project_poi.compute",
  key: "propertyId" | "projectId",
  id: string,
): Promise<PoiRunView | null> {
  const [last] = await db
    .select()
    .from(jobRuns)
    .where(
      and(
        eq(jobRuns.agencyId, currentAgencyId()),
        eq(jobRuns.name, job),
        sql`${jobRuns.payload}->>${key} = ${id}`,
      ),
    )
    .orderBy(desc(jobRuns.createdAt))
    .limit(1);
  if (!last) return null;
  const result = (last.result ?? null) as Partial<PoiComputeResult> | null;
  return {
    status: last.status,
    at: (last.finishedAt ?? last.createdAt).toISOString(),
    mode: result?.mode ?? null,
    note: result?.note ?? null,
    error: last.status === "succeeded" ? null : last.lastError,
  };
}

const poiInfo = {
  name: pois.name,
  typeName: poiTypes.name,
  typeIcon: poiTypes.icon,
  category: poiTypes.category,
  travelMode: poiTypes.travelMode,
};

export async function listPropertyPois(db: DbOrTx, propertyId: string): Promise<PropertyPoisView> {
  const rows = await db
    .select({ row: propertyPois, ...poiInfo })
    .from(propertyPois)
    .innerJoin(pois, eq(pois.id, propertyPois.poiId))
    .innerJoin(poiTypes, eq(poiTypes.id, pois.poiTypeId))
    .where(
      and(eq(propertyPois.propertyId, propertyId), eq(propertyPois.agencyId, currentAgencyId())),
    )
    .orderBy(asc(propertyPois.sortOrder), asc(propertyPois.straightDistanceM), asc(pois.name));
  return {
    rows: rows.map(({ row, ...p }) => toView(row, p)),
    lastRun: await lastRun(db, "poi.compute", "propertyId", propertyId),
    mapsConfigured: await mapsConfigured(db),
  };
}

/** The same for a project (07 §6). */
export async function listProjectPois(db: DbOrTx, projectId: string): Promise<PropertyPoisView> {
  const rows = await db
    .select({ row: projectPois, ...poiInfo })
    .from(projectPois)
    .innerJoin(pois, eq(pois.id, projectPois.poiId))
    .innerJoin(poiTypes, eq(poiTypes.id, pois.poiTypeId))
    .where(and(eq(projectPois.projectId, projectId), eq(projectPois.agencyId, currentAgencyId())))
    .orderBy(asc(projectPois.sortOrder), asc(projectPois.straightDistanceM), asc(pois.name));
  return {
    rows: rows.map(({ row, ...p }) => toView(row, p)),
    lastRun: await lastRun(db, "project_poi.compute", "projectId", projectId),
    mapsConfigured: await mapsConfigured(db),
  };
}
