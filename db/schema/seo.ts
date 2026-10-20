import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { baseColumns } from "./_common";

/** Redirects manager (08 §6): manual and automatic (slug change) redirects, with hit counts. */
export const seoRedirects = pgTable(
  "seo_redirects",
  {
    ...baseColumns(),
    fromPath: text().notNull(),
    toPath: text().notNull(),
    type: integer().notNull().default(301),
    hits: integer().notNull().default(0),
    lastHitAt: timestamp({ withTimezone: true }),
    isAuto: boolean().notNull().default(false),
    /** What created it, e.g. "location:<id>" for slug changes. */
    source: text(),
  },
  (t) => [
    uniqueIndex("seo_redirects_from_unique").on(t.agencyId, t.fromPath),
    index("seo_redirects_to_idx").on(t.agencyId, t.toPath),
  ],
);
