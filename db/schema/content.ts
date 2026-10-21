import {
  boolean,
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
import type { RichDoc } from "@/lib/rich-text";
import { agencyColumn, baseColumns, idColumn, seoColumns, softDelete } from "./_common";
import { locations } from "./master-data";
import { media } from "./media";
import { agents } from "./people";
import { properties } from "./properties";

/** Website content (05 §8, 08 §2-5): blog, area guides, testimonials, FAQs, menus, 404 log. */

export const contentStatuses = ["draft", "published", "scheduled"] as const;
export type ContentStatus = (typeof contentStatuses)[number];

export const postCategories = pgTable(
  "post_categories",
  {
    ...baseColumns(),
    name: text().notNull(),
    description: text(),
    sortOrder: integer().notNull().default(0),
    ...seoColumns(),
  },
  (t) => [uniqueIndex("post_categories_slug_unique").on(t.agencyId, t.slug)],
);

export const postTags = pgTable(
  "post_tags",
  {
    ...baseColumns(),
    name: text().notNull(),
    slug: text().notNull(),
  },
  (t) => [uniqueIndex("post_tags_slug_unique").on(t.agencyId, t.slug)],
);

/** Blog posts ("Insights"). The body is rich text JSON with its rendered HTML. */
export const posts = pgTable(
  "posts",
  {
    ...baseColumns(),
    title: text().notNull(),
    excerpt: text(),
    body: jsonb().$type<RichDoc>(),
    bodyHtml: text(),
    coverId: uuid().references(() => media.id, { onDelete: "set null" }),
    /** The byline: an agent profile, or an admin user (no FK: the auth table). */
    authorAgentId: uuid().references(() => agents.id, { onDelete: "set null" }),
    authorUserId: uuid(),
    categoryId: uuid().references(() => postCategories.id, { onDelete: "set null" }),
    status: text({ enum: contentStatuses }).notNull().default("draft"),
    publishAt: timestamp({ withTimezone: true }),
    publishedAt: timestamp({ withTimezone: true }),
    /** Worked out on save from the body's word count. */
    readingMinutes: integer().notNull().default(1),
    relatedPropertyIds: uuid().array().notNull().default([]),
    /** Drafted by the AI assistant: never published without a person (10 §3). */
    isAiDrafted: boolean().notNull().default(false),
    viewsCount: integer().notNull().default(0),
    ...seoColumns(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex("posts_slug_unique").on(t.agencyId, t.slug),
    index("posts_status_idx").on(t.agencyId, t.status, t.publishedAt),
    index("posts_category_idx").on(t.categoryId),
  ],
);

export const postTagLinks = pgTable(
  "post_tag_links",
  {
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => postTags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.tagId] }),
    index("post_tag_links_tag_idx").on(t.tagId),
  ],
);

/** One admin-entered number on an area guide, always with where it comes from (08 §4). */
export type GuideStat = { label: string; value: string; source: string };

/** Area guides, one per location (08 §4). */
export const areaGuides = pgTable(
  "area_guides",
  {
    ...baseColumns(),
    locationId: uuid()
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    title: text().notNull(),
    intro: text(),
    body: jsonb().$type<RichDoc>(),
    bodyHtml: text(),
    coverId: uuid().references(() => media.id, { onDelete: "set null" }),
    highlights: text().array().notNull().default([]),
    stats: jsonb().$type<GuideStat[]>().notNull().default([]),
    relatedPostIds: uuid().array().notNull().default([]),
    status: text({ enum: contentStatuses }).notNull().default("draft"),
    publishAt: timestamp({ withTimezone: true }),
    publishedAt: timestamp({ withTimezone: true }),
    ...seoColumns(),
    ...softDelete(),
  },
  (t) => [
    uniqueIndex("area_guides_slug_unique").on(t.agencyId, t.slug),
    uniqueIndex("area_guides_location_unique").on(t.agencyId, t.locationId),
  ],
);

export const areaGuideMedia = pgTable(
  "area_guide_media",
  {
    id: idColumn(),
    agencyId: agencyColumn(),
    guideId: uuid()
      .notNull()
      .references(() => areaGuides.id, { onDelete: "cascade" }),
    mediaId: uuid()
      .notNull()
      .references(() => media.id, { onDelete: "restrict" }),
    sortOrder: integer().notNull().default(0),
    caption: text(),
    alt: text(),
  },
  (t) => [index("area_guide_media_guide_idx").on(t.guideId, t.sortOrder)],
);

export const testimonials = pgTable("testimonials", {
  ...baseColumns(),
  name: text().notNull(),
  roleText: text(),
  quote: text().notNull(),
  /** 1-5, optional. */
  rating: integer(),
  photoId: uuid().references(() => media.id, { onDelete: "set null" }),
  propertyId: uuid().references(() => properties.id, { onDelete: "set null" }),
  isPublished: boolean().notNull().default(false),
  sortOrder: integer().notNull().default(0),
});

export const faqGroups = ["buying", "renting", "off_plan", "selling", "general"] as const;

/** FAQs (08 §5): used by pages, area guides and the AI assistant. */
export const faqs = pgTable(
  "faqs",
  {
    ...baseColumns(),
    question: text().notNull(),
    answer: jsonb().$type<RichDoc>().notNull(),
    answerHtml: text().notNull(),
    group: text({ enum: faqGroups }).notNull().default("general"),
    /** FAQs shown on one area guide only. */
    areaGuideId: uuid().references(() => areaGuides.id, { onDelete: "cascade" }),
    isPublished: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [index("faqs_group_idx").on(t.agencyId, t.group, t.sortOrder)],
);

export const menuLocations = ["header", "mobile", "footer_1", "footer_2", "footer_3"] as const;

/** A menu item as stored (08 §2); validated by the menus feature. */
export type MenuItem = {
  id: string;
  label: string;
  /** page, url, search (a search preset query), area, project, category */
  type: string;
  target: string;
  openInNewTab: boolean;
  children?: MenuItem[];
};

export const menus = pgTable(
  "menus",
  {
    ...baseColumns(),
    location: text({ enum: menuLocations }).notNull(),
    title: text(),
    items: jsonb().$type<MenuItem[]>().notNull().default([]),
  },
  (t) => [uniqueIndex("menus_location_unique").on(t.agencyId, t.location)],
);

/** 404 monitor (08 §6): paths visitors hit that do not exist, with counts. */
export const notFoundLog = pgTable(
  "not_found_log",
  {
    id: idColumn(),
    agencyId: agencyColumn(),
    path: text().notNull(),
    hits: integer().notNull().default(1),
    lastReferrer: text(),
    firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Set when a redirect was created for it or it was dismissed. */
    resolvedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("not_found_log_path_unique").on(t.agencyId, t.path),
    index("not_found_log_hits_idx").on(t.agencyId, t.hits),
  ],
);
