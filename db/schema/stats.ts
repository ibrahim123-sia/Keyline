import { bigint, date, index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "./_common";
import { locations, propertyTypes } from "./master-data";
import { propertyPurposes } from "./properties";

/** Where a monthly figure comes from (11 §7), labelled on the chart. */
export const priceStatSources = ["agency_data", "admin_entered"] as const;
export type PriceStatSource = (typeof priceStatSources)[number];

/**
 * Price trends per location and month (05 §15, 11 §7). `agency_data` rows are written by the
 * monthly job from the agency's own listings and closed deals (features/price-trends/compute.ts);
 * `admin_entered` rows are typed in by an admin with a source note (e.g. a public market report).
 * A null property type is the figure for all types together.
 */
export const areaPriceStats = pgTable(
  "area_price_stats",
  {
    ...baseColumns(),
    locationId: uuid()
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    /** The first day of the month. */
    period: date().notNull(),
    purpose: text({ enum: propertyPurposes }).notNull(),
    propertyTypeId: uuid().references(() => propertyTypes.id, { onDelete: "cascade" }),
    /** Minor units of `currency` per m²; rents are per year whatever the market's rent period. */
    medianPricePerArea: bigint({ mode: "number" }).notNull(),
    currency: text().notNull(),
    /** Listings on the market at the end of the month (agency data), or as reported. */
    listingsCount: integer().notNull().default(0),
    /** Closed deals among the figure's data points (agency data). */
    dealsCount: integer().notNull().default(0),
    /** Average days from going live to the deal, for the month's closed deals. */
    avgDaysOnMarket: integer(),
    source: text({ enum: priceStatSources }).notNull(),
    sourceNote: text(),
  },
  (t) => [
    unique("area_price_stats_unique")
      .on(t.agencyId, t.locationId, t.period, t.purpose, t.propertyTypeId, t.source)
      .nullsNotDistinct(),
    index("area_price_stats_location_idx").on(t.locationId, t.purpose, t.period),
    index("area_price_stats_period_idx").on(t.agencyId, t.source, t.period),
  ],
);
