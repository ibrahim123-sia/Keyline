import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { users } from "@/db/schema/auth";
import {
  areaGuideMedia,
  areaGuides,
  faqs,
  postCategories,
  postTagLinks,
  postTags,
  posts,
  testimonials,
  type GuideStat,
} from "@/db/schema/content";
import { locations } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { properties } from "@/db/schema/properties";
import type { FaqGroup } from "@/features/faqs/schema";
import { prepareBody } from "@/features/content/body";
import { locationAndBelow } from "@/features/properties/queries";
import { searchableStatuses } from "@/features/properties/status";
import { renderRichText, type RichDoc } from "@/lib/rich-text";
import { postDocSchema, type PostDoc } from "@/lib/rich-text-post";
import { slugify } from "@/lib/slug";
import {
  bedroom,
  kitchen,
  livingRoom,
  palettes,
  pool,
  portrait,
  tower,
  villa,
  type Picture,
} from "./images";

/**
 * Demo website content (16 §1 "Content"): blog posts, area guides, FAQs and testimonials,
 * written in the preset. Every number an area guide shows carries a source note.
 */

/** A block of demo text; `listing` puts in a card of a live listing in that location. */
export type SeedBlock =
  | { h: string }
  | { p: string }
  | { list: string[] }
  | { quote: string }
  | { table: string[][] }
  | { cta: { label: string; href: string } }
  | { listing: string };

type Cover = "tower" | "villa" | "living" | "bedroom" | "kitchen" | "pool";

export type SeedContent = {
  categories: Array<{ key: string; name: string; description: string }>;
  posts: Array<{
    title: string;
    excerpt: string;
    category: string;
    tags: string[];
    /** Agent slug; none = the agency. */
    author?: string;
    daysAgo: number;
    cover: Cover;
    /** Location key whose live listings become the related homes. */
    relatedArea?: string;
    body: SeedBlock[];
  }>;
  guides: Array<{
    /** Location key. */
    location: string;
    intro: string;
    cover: Cover;
    photos: Array<{ picture: Cover; caption: string }>;
    highlights: string[];
    stats: GuideStat[];
    faqs: Array<{ q: string; a: string }>;
    /** Indexes into `posts`. */
    relatedPosts: number[];
    body: SeedBlock[];
  }>;
  faqs: Array<{ group: FaqGroup; q: string; a: string }>;
  testimonials: Array<{ name: string; role: string; quote: string; rating: number | null }>;
};

type Store = (
  pic: Picture,
  meta: { fileName: string; alt: string; folder: string },
) => Promise<string>;

const DAY = 86_400_000;
const text = (t: string) => ({ type: "text" as const, text: t });
const paragraph = (t: string) => ({ type: "paragraph" as const, content: [text(t)] });

const answerDoc = (a: string): RichDoc => ({
  type: "doc",
  content: a.split("\n\n").map(paragraph),
});

function picture(kind: Cover, n: number): Promise<Picture> {
  const p = palettes[n % palettes.length]!;
  switch (kind) {
    case "tower":
      return tower(p, n);
    case "villa":
      return villa(p, n);
    case "living":
      return livingRoom(p, n);
    case "bedroom":
      return bedroom(p, n);
    case "kitchen":
      return kitchen(p);
    case "pool":
      return pool(p);
  }
}

/** Live listing ids in a location and below it, newest first. */
async function liveListings(db: Db, locationId: string, limit: number): Promise<string[]> {
  const rows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        isNotNull(properties.publishedAt),
        inArray(properties.status, [...searchableStatuses]),
        sql`${properties.locationId} in ${locationAndBelow(locationId)}`,
      ),
    )
    .orderBy(sql`${properties.publishedAt} desc`)
    .limit(limit);
  return rows.map((r) => r.id);
}

async function toDoc(
  db: Db,
  blocks: SeedBlock[],
  locationIds: Map<string, string>,
): Promise<PostDoc> {
  const content: unknown[] = [];
  const used = new Set<string>();
  for (const b of blocks) {
    if ("h" in b) content.push({ type: "heading", attrs: { level: 2 }, content: [text(b.h)] });
    else if ("p" in b) content.push(paragraph(b.p));
    else if ("list" in b)
      content.push({
        type: "bulletList",
        content: b.list.map((item) => ({ type: "listItem", content: [paragraph(item)] })),
      });
    else if ("quote" in b) content.push({ type: "blockquote", content: [paragraph(b.quote)] });
    else if ("table" in b)
      content.push({
        type: "table",
        content: b.table.map((row, r) => ({
          type: "tableRow",
          content: row.map((cell) => ({
            type: r === 0 ? "tableHeader" : "tableCell",
            content: [paragraph(cell)],
          })),
        })),
      });
    else if ("cta" in b)
      content.push({ type: "ctaButton", attrs: { ...b.cta, variant: "primary" } });
    else {
      const loc = locationIds.get(b.listing);
      const id = loc ? (await liveListings(db, loc, 6)).find((x) => !used.has(x)) : undefined;
      if (id) {
        used.add(id);
        content.push({ type: "propertyCard", attrs: { propertyId: id } });
      }
    }
  }
  // The same allowlist the editor's saves go through.
  return postDocSchema.parse({ type: "doc", content });
}

export async function seedContent(
  db: Db,
  content: SeedContent,
  options: { now: Date; store: Store; locationKeys: Map<string, string> },
): Promise<void> {
  const { now, store } = options;
  // Location key -> id (the preset's keys, via their slugs).
  const slugs = [...options.locationKeys.values()];
  const locRows = await db
    .select({ id: locations.id, slug: locations.slug, name: locations.name })
    .from(locations)
    .where(inArray(locations.slug, slugs));
  const bySlug = new Map(locRows.map((l) => [l.slug, l]));
  const locationIds = new Map(
    [...options.locationKeys].flatMap(([key, slug]) =>
      bySlug.get(slug) ? [[key, bySlug.get(slug)!.id] as const] : [],
    ),
  );
  const agentRows = await db.select({ id: agents.id, slug: agents.slug }).from(agents);
  const agentBySlug = new Map(agentRows.map((a) => [a.slug, a.id]));
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.readOnly, false)))
    .orderBy(asc(users.createdAt))
    .limit(1);

  // Categories and tags.
  const categoryIds = new Map<string, string>();
  for (const [i, c] of content.categories.entries()) {
    const [row] = await db
      .insert(postCategories)
      .values({ name: c.name, slug: slugify(c.name), description: c.description, sortOrder: i })
      .returning({ id: postCategories.id });
    categoryIds.set(c.key, row!.id);
  }
  const tagIds = new Map<string, string>();
  for (const name of new Set(content.posts.flatMap((p) => p.tags))) {
    const [row] = await db
      .insert(postTags)
      .values({ name, slug: slugify(name, 60) })
      .returning({ id: postTags.id });
    tagIds.set(name, row!.id);
  }

  // Posts, newest first in the list.
  const postIds: string[] = [];
  for (const [i, p] of content.posts.entries()) {
    const cover = await store(await picture(p.cover, 40 + i), {
      fileName: `insights-${slugify(p.title)}`,
      alt: p.title,
      folder: "insights",
    });
    const body = await prepareBody(db, await toDoc(db, p.body, locationIds));
    const published = new Date(now.getTime() - p.daysAgo * DAY);
    const area = p.relatedArea ? locationIds.get(p.relatedArea) : undefined;
    const [row] = await db
      .insert(posts)
      .values({
        title: p.title,
        slug: slugify(p.title),
        excerpt: p.excerpt,
        body: body.body,
        bodyHtml: body.bodyHtml,
        readingMinutes: body.readingMinutes,
        coverId: cover,
        categoryId: categoryIds.get(p.category) ?? null,
        authorAgentId: p.author ? (agentBySlug.get(p.author) ?? null) : null,
        relatedPropertyIds: area ? await liveListings(db, area, 3) : [],
        status: "published",
        publishedAt: published,
        createdAt: published,
        createdBy: owner?.id ?? null,
      })
      .returning({ id: posts.id });
    postIds.push(row!.id);
    if (p.tags.length)
      await db
        .insert(postTagLinks)
        .values(p.tags.map((t) => ({ postId: row!.id, tagId: tagIds.get(t)! })));
  }

  // Area guides with their photos and questions.
  for (const [i, g] of content.guides.entries()) {
    const locationId = locationIds.get(g.location);
    if (!locationId) continue;
    const name = locRows.find((l) => l.id === locationId)!.name;
    const cover = await store(await picture(g.cover, 60 + i), {
      fileName: `area-${slugify(name)}`,
      alt: name,
      folder: "areas",
    });
    const body = await prepareBody(db, await toDoc(db, g.body, locationIds));
    const published = new Date(now.getTime() - (30 + i) * DAY);
    const [row] = await db
      .insert(areaGuides)
      .values({
        locationId,
        title: name,
        slug: slugify(name),
        intro: g.intro,
        body: body.body,
        bodyHtml: body.bodyHtml,
        coverId: cover,
        highlights: g.highlights,
        stats: g.stats,
        relatedPostIds: g.relatedPosts.flatMap((n) => (postIds[n] ? [postIds[n]!] : [])),
        status: "published",
        publishedAt: published,
      })
      .returning({ id: areaGuides.id });
    for (const [j, ph] of g.photos.entries()) {
      const mediaId = await store(await picture(ph.picture, 80 + i * 5 + j), {
        fileName: `area-${slugify(name)}-${j + 1}`,
        alt: ph.caption,
        folder: "areas",
      });
      await db
        .insert(areaGuideMedia)
        .values({ guideId: row!.id, mediaId, sortOrder: j, caption: ph.caption });
    }
    for (const [j, f] of g.faqs.entries()) {
      const answer = answerDoc(f.a);
      await db.insert(faqs).values({
        question: f.q,
        answer,
        answerHtml: renderRichText(answer),
        areaGuideId: row!.id,
        isPublished: true,
        sortOrder: j,
      });
    }
  }

  // The shared FAQs, in order within each group.
  const order = new Map<string, number>();
  for (const f of content.faqs) {
    const n = order.get(f.group) ?? 0;
    order.set(f.group, n + 1);
    const answer = answerDoc(f.a);
    await db.insert(faqs).values({
      question: f.q,
      answer,
      answerHtml: renderRichText(answer),
      group: f.group,
      isPublished: true,
      sortOrder: n,
    });
  }

  for (const [i, t] of content.testimonials.entries()) {
    const initials = t.name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2);
    const photoId = await store(await portrait(initials, palettes[i % palettes.length]!.accent), {
      fileName: `testimonial-${slugify(t.name)}`,
      alt: t.name,
      folder: "testimonials",
    });
    await db.insert(testimonials).values({
      name: t.name,
      roleText: t.role,
      quote: t.quote,
      rating: t.rating,
      photoId,
      isPublished: true,
      sortOrder: i,
    });
  }
}
