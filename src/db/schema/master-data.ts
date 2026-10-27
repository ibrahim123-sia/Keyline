import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  boolean,
  integer,
  uuid,
  jsonb,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { baseColumns, geoPoint, geoPolygon, seoColumns, softDelete } from "./_common";

/** Master data (05-data-model.md §3), edited in Admin -> Setup (07 §1). */

export const locationLevels = ["country", "city", "area", "community", "building"] as const;
export type LocationLevel = (typeof locationLevels)[number];

export const locations = pgTable(
  "locations",
  {
    ...baseColumns(),
    parentId: uuid().references((): AnyPgColumn => locations.id, { onDelete: "restrict" }),
    level: text({ enum: locationLevels }).notNull(),
    name: text().notNull(),
    /** Optional boundary drawn on the map (Polygon or MultiPolygon). */
    geom: geoPolygon(),
    center: geoPoint(),
    description: text(),
    isFeatured: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    ...seoColumns(),
  },
  (t) => [
    uniqueIndex("locations_slug_unique").on(t.agencyId, t.slug),
    index("locations_parent_idx").on(t.parentId, t.sortOrder),
    index("locations_center_gist").using("gist", t.center),
    index("locations_geom_gist").using("gist", t.geom),
    index("locations_name_trgm").using("gin", sql`lintel_normalize(${t.name}) gin_trgm_ops`),
  ],
);

export const propertyCategories = ["residential", "commercial", "land"] as const;
/** Fields a property type can hide in the editor and on the site (land hides beds/baths). */
export const hideableFields = [
  "beds",
  "baths",
  "size",
  "plotSize",
  "floor",
  "furnishing",
  "parking",
] as const;
export type HideableField = (typeof hideableFields)[number];

export const propertyTypes = pgTable(
  "property_types",
  {
    ...baseColumns(),
    name: text().notNull(),
    /** Plural used in SEO landing URLs and H1s, e.g. "apartments" (06 §1). */
    slug: text().notNull(),
    pluralName: text(),
    category: text({ enum: propertyCategories }).notNull().default("residential"),
    icon: text(),
    sortOrder: integer().notNull().default(0),
    fieldsHidden: jsonb().$type<HideableField[]>().notNull().default([]),
  },
  (t) => [uniqueIndex("property_types_slug_unique").on(t.agencyId, t.slug)],
);

export const facilityGroups = ["building", "unit", "community"] as const;

export const facilities = pgTable(
  "facilities",
  {
    ...baseColumns(),
    name: text().notNull(),
    icon: text(),
    group: text({ enum: facilityGroups }).notNull().default("building"),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [index("facilities_group_idx").on(t.agencyId, t.group, t.sortOrder)],
);

export const badgeAutoRules = [
  "none",
  "price_reduced",
  "new_listing",
  "verified",
  "off_plan",
] as const;
export type BadgeAutoRule = (typeof badgeAutoRules)[number];

export const badges = pgTable("badges", {
  ...baseColumns(),
  name: text().notNull(),
  color: text().notNull().default("#F3E6DF"),
  textColor: text().notNull().default("#14232B"),
  icon: text(),
  autoRule: text({ enum: badgeAutoRules }).notNull().default("none"),
  /** For time-limited automatic badges, e.g. "New" for 14 days. */
  autoDays: integer(),
  sortOrder: integer().notNull().default(0),
});

export const poiCategories = [
  "schools",
  "health",
  "shopping",
  "transport",
  "leisure",
  "other",
] as const;
export type PoiCategory = (typeof poiCategories)[number];

export const poiTypes = pgTable("poi_types", {
  ...baseColumns(),
  name: text().notNull(),
  icon: text(),
  /** Filter chip group on the property page (06 §5.10). */
  category: text({ enum: poiCategories }).notNull().default("other"),
  /** Google Places type used by "Import from Google" (e.g. "school", "shopping_mall"). */
  googlePlaceType: text(),
  defaultSearchRadiusM: integer().notNull().default(3000),
  showOnProperty: boolean().notNull().default(true),
  travelMode: text({ enum: ["drive", "walk"] })
    .notNull()
    .default("drive"),
  sortOrder: integer().notNull().default(0),
});

export const pois = pgTable(
  "pois",
  {
    ...baseColumns(),
    poiTypeId: uuid()
      .notNull()
      .references(() => poiTypes.id, { onDelete: "restrict" }),
    name: text().notNull(),
    address: text(),
    point: geoPoint().notNull(),
    googlePlaceId: text(),
    website: text(),
    ratingNote: text(),
    isActive: boolean().notNull().default(true),
  },
  (t) => [
    index("pois_point_gist").using("gist", t.point),
    // ST_DWithin(point::geography, ...) for "POIs within N metres" uses this index.
    index("pois_point_geog_gist").using("gist", sql`(${t.point}::geography)`),
    index("pois_type_idx").on(t.poiTypeId, t.isActive),
    index("pois_name_trgm").using("gin", sql`lintel_normalize(${t.name}) gin_trgm_ops`),
    uniqueIndex("pois_google_place_unique")
      .on(t.agencyId, t.googlePlaceId)
      .where(sql`${t.googlePlaceId} is not null`),
  ],
);

export const developers = pgTable(
  "developers",
  {
    ...baseColumns(),
    name: text().notNull(),
    logoId: uuid(),
    description: text(),
    website: text(),
    establishedYear: integer(),
    sortOrder: integer().notNull().default(0),
    ...seoColumns(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex("developers_slug_unique").on(t.agencyId, t.slug),
    index("developers_name_trgm").using("gin", sql`lintel_normalize(${t.name}) gin_trgm_ops`),
  ],
);

/** CRM pipeline stages (05 §10), edited in Settings -> Leads and CRM (04 §5). */
export const leadStageKinds = ["open", "won", "lost"] as const;

export const leadStages = pgTable("lead_stages", {
  ...baseColumns(),
  name: text().notNull(),
  sortOrder: integer().notNull().default(0),
  color: text().notNull().default("#5B6670"),
  kind: text({ enum: leadStageKinds }).notNull().default("open"),
});
