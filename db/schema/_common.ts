import { customType, uuid, timestamp, text, boolean, jsonb } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import {
  parseEwkbPoint,
  parseEwkbPolygon,
  pointToEwkt,
  polygonToEwkt,
  type GeoPolygon,
  type LngLat,
} from "@/lib/geo";

/**
 * Shared column helpers. Column names are snake_case through Drizzle's `casing` option,
 * so JS keys stay camelCase (Better Auth and app code use the same keys).
 */

export function currentAgencyId(): string {
  return process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";
}

export const idColumn = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => newId());

export const agencyColumn = () =>
  uuid()
    .notNull()
    .$defaultFn(() => currentAgencyId());

export const timestamps = () => ({
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

/** Admin user ids (no FK: the actor can also be AI or a system job). */
export const authorship = () => ({
  createdBy: uuid(),
  updatedBy: uuid(),
});

/** Every main table: id, agency_id, created/updated at/by. */
export const baseColumns = () => ({
  id: idColumn(),
  agencyId: agencyColumn(),
  ...timestamps(),
  ...authorship(),
});

export const softDelete = () => ({
  deletedAt: timestamp({ withTimezone: true }),
});

/** Embedded SEO block (05-data-model.md, "SEO-able tables"). */
export const seoColumns = () => ({
  slug: text().notNull(),
  seoTitle: text(),
  seoDescription: text(),
  ogImageId: uuid(),
  canonicalUrl: text(),
  noindex: boolean().notNull().default(false),
  schemaOverride: jsonb().$type<Record<string, unknown>>(),
});

/* ------------------------------ PostGIS types ----------------------------- */

/** geometry(Point, 4326) mapped to `{ lng, lat }`. */
export const geoPoint = customType<{ data: LngLat; driverData: string }>({
  dataType() {
    return "geometry(Point, 4326)";
  },
  toDriver(value) {
    return pointToEwkt(value);
  },
  fromDriver(value) {
    return parseEwkbPoint(value);
  },
});

/** geometry(Geometry, 4326) holding a Polygon or MultiPolygon, mapped to GeoJSON. */
export const geoPolygon = customType<{ data: GeoPolygon; driverData: string }>({
  dataType() {
    return "geometry(Geometry, 4326)";
  },
  toDriver(value) {
    return polygonToEwkt(value);
  },
  fromDriver(value) {
    return parseEwkbPolygon(value);
  },
});

/** Full-text search vector (always a generated column; never written by the app). */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/** numeric mapped to a JS number (areas, percents). Money never uses this: it is bigint minor units. */
export const numericNumber = customType<{ data: number; driverData: string }>({
  dataType() {
    return "numeric";
  },
  fromDriver(value) {
    return Number(value);
  },
  toDriver(value) {
    return String(value);
  },
});
