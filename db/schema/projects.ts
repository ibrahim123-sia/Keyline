import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  agencyColumn,
  baseColumns,
  geoPoint,
  idColumn,
  numericNumber,
  seoColumns,
  softDelete,
  timestamps,
} from "./_common";
import { developers, facilities, locations } from "./master-data";
import { media } from "./media";
import { paymentPlans } from "./payment-plans";

export const projectStatuses = ["announced", "under_construction", "completed"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

/** Rich text as stored: the editor's JSON document plus the HTML rendered from it on save. */
export type RichDoc = { type: "doc"; content?: unknown[] };

/** Off-plan developments (05 §4, 07 §6). */
export const projects = pgTable(
  "projects",
  {
    ...baseColumns(),
    developerId: uuid().references(() => developers.id, { onDelete: "restrict" }),
    name: text().notNull(),
    locationId: uuid().references(() => locations.id, { onDelete: "restrict" }),
    point: geoPoint(),
    status: text({ enum: projectStatuses }).notNull().default("announced"),
    launchDate: date(),
    handoverDate: date(),
    /** When only a quarter is known, e.g. "Q4 2027". */
    handoverText: text(),
    constructionProgress: integer(),
    progressUpdatedAt: timestamp({ withTimezone: true }),
    /** Minor units of `currency`. */
    startingPrice: bigint({ mode: "number" }),
    currency: text(),
    unitTypesSummary: text(),
    totalUnits: integer(),
    description: jsonb().$type<RichDoc>(),
    descriptionHtml: text(),
    highlights: text().array().notNull().default([]),
    brochureId: uuid().references(() => media.id, { onDelete: "set null" }),
    masterPlanId: uuid().references(() => media.id, { onDelete: "set null" }),
    videoUrl: text(),
    tourUrl: text(),
    paymentPlanId: uuid().references(() => paymentPlans.id, { onDelete: "set null" }),
    isFeatured: boolean().notNull().default(false),
    isPublished: boolean().notNull().default(false),
    publishedAt: timestamp({ withTimezone: true }),
    ...seoColumns(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex("projects_slug_unique").on(t.agencyId, t.slug),
    index("projects_developer_idx").on(t.developerId),
    index("projects_location_idx").on(t.locationId),
    index("projects_point_gist").using("gist", t.point),
    index("projects_name_trgm").using("gin", sql`lintel_normalize(${t.name}) gin_trgm_ops`),
  ],
);

export const projectFacilities = pgTable(
  "project_facilities",
  {
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    facilityId: uuid()
      .notNull()
      .references(() => facilities.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.facilityId] }),
    index("project_facilities_facility_idx").on(t.facilityId),
  ],
);

export const listingMediaKinds = ["photo", "floor_plan", "video", "brochure", "document"] as const;
export type ListingMediaKind = (typeof listingMediaKinds)[number];

export const projectMedia = pgTable(
  "project_media",
  {
    id: idColumn(),
    agencyId: agencyColumn(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    mediaId: uuid()
      .notNull()
      .references(() => media.id, { onDelete: "restrict" }),
    kind: text({ enum: listingMediaKinds }).notNull().default("photo"),
    sortOrder: integer().notNull().default(0),
    isCover: boolean().notNull().default(false),
    caption: text(),
    alt: text(),
    ...timestamps(),
  },
  (t) => [
    index("project_media_project_idx").on(t.projectId, t.sortOrder),
    index("project_media_media_idx").on(t.mediaId),
  ],
);

export const projectUnitTypes = pgTable(
  "project_unit_types",
  {
    id: idColumn(),
    agencyId: agencyColumn(),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** e.g. "2 bed type B". */
    name: text().notNull(),
    beds: integer(),
    baths: integer(),
    /** m². */
    sizeMin: numericNumber(),
    sizeMax: numericNumber(),
    priceFrom: bigint({ mode: "number" }),
    floorPlanId: uuid().references(() => media.id, { onDelete: "set null" }),
    availableCount: integer(),
    sortOrder: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [index("project_unit_types_project_idx").on(t.projectId, t.sortOrder)],
);
