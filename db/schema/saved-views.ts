import { integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "./_common";

/**
 * Named filter sets for admin tables (07 §2, 09 "saved views"), shared by the agency's
 * admins. `query` is the table's URL query without paging, e.g. "status=draft&agent=…".
 */
export const savedViews = pgTable(
  "saved_views",
  {
    ...baseColumns(),
    tableId: text().notNull(),
    name: text().notNull(),
    query: text().notNull(),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [uniqueIndex("saved_views_name_unique").on(t.agencyId, t.tableId, t.name)],
);
