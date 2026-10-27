import {
  pgTable,
  text,
  boolean,
  integer,
  uuid,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { baseColumns, seoColumns } from "./_common";

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
/** Per weekday: list of [start, end] in "HH:MM" agency time. Empty list = day off. */
export type WorkingHours = Partial<Record<WeekdayKey, Array<[string, string]>>>;

/** Agent profiles are not users (03-roles-and-permissions.md). They never log in. */
export const agents = pgTable(
  "agents",
  {
    ...baseColumns(),
    name: text().notNull(),
    title: text(),
    photoId: uuid(),
    phone: text(),
    whatsapp: text(),
    email: text(),
    languages: text().array().notNull().default([]),
    /** Location ids this agent covers (used by the "area match" assignment rule). */
    areas: uuid().array().notNull().default([]),
    bio: text(),
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    /** Shown on the contact card, e.g. "usually replies in a minute". */
    replyTimeText: text(),
    calendarConnected: boolean().notNull().default(false),
    googleCalendarId: text(),
    workingHours: jsonb().$type<WorkingHours>(),
    /** Round-robin bookkeeping for lead assignment. */
    lastAssignedAt: timestamp({ withTimezone: true }),
    ...seoColumns(),
  },
  (t) => [
    uniqueIndex("agents_slug_unique").on(t.agencyId, t.slug),
    index("agents_active_idx").on(t.agencyId, t.isActive, t.sortOrder),
  ],
);
