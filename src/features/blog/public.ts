import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { users } from "@/db/schema/auth";
import { postCategories, postTagLinks, postTags, posts } from "@/db/schema/content";
import { agents } from "@/db/schema/people";
import { bodyMedia } from "@/features/content/body";
import { getPublicMedia, type PublicMedia } from "@/features/media/queries";
import { htmlToText } from "@/features/site/seo";
import { siteOrigin } from "@/features/site/url";
import { tags } from "@/lib/cache-tags";
import {
  postReferences,
  postWordCount,
  renderPostSegments,
  type PostSegment,
} from "@/lib/rich-text-post";

/** The public blog, "Insights" (06 §9): lists, category pages and the post page. Cached. */

export const INSIGHTS_PAGE_SIZE = 12;

export type PostCardData = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover: PublicMedia | null;
  category: { name: string; slug: string } | null;
  publishedAt: string;
  readingMinutes: number;
};

export type InsightsQuery = {
  category: string | null;
  tag: string | null;
  q: string;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SLUG = /^[a-z0-9-]{1,100}$/;

/** ?q= words, ?tag= tag slug and ?page= from the address. */
export function parseInsightsQuery(sp: Params, category: string | null = null): InsightsQuery {
  const tag = first(sp.tag)?.trim().toLowerCase() ?? "";
  return {
    category,
    tag: SLUG.test(tag) ? tag : null,
    q: (first(sp.q) ?? "").trim().slice(0, 100),
    page: Math.min(500, Math.max(1, Number.parseInt(first(sp.page) ?? "", 10) || 1)),
  };
}

const isPublic = (): SQL =>
  and(
    eq(posts.agencyId, currentAgencyId()),
    eq(posts.status, "published"),
    isNull(posts.deletedAt),
    isNotNull(posts.publishedAt),
  )!;

const cardColumns = {
  id: posts.id,
  slug: posts.slug,
  title: posts.title,
  excerpt: posts.excerpt,
  bodyHtml: posts.bodyHtml,
  coverId: posts.coverId,
  publishedAt: posts.publishedAt,
  readingMinutes: posts.readingMinutes,
  categoryName: postCategories.name,
  categorySlug: postCategories.slug,
};

type CardRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyHtml: string | null;
  coverId: string | null;
  publishedAt: Date | null;
  readingMinutes: number;
  categoryName: string | null;
  categorySlug: string | null;
};

async function toCards(rows: CardRow[]): Promise<PostCardData[]> {
  const cards: PostCardData[] = [];
  for (const r of rows)
    cards.push({
      id: r.id,
      slug: r.slug,
      title: r.title,
      excerpt: r.excerpt || htmlToText(r.bodyHtml, 180) || null,
      cover: await getPublicMedia(r.coverId),
      category:
        r.categoryName && r.categorySlug ? { name: r.categoryName, slug: r.categorySlug } : null,
      publishedAt: r.publishedAt!.toISOString(),
      readingMinutes: r.readingMinutes,
    });
  return cards;
}

/** Published posts, newest first, a page at a time; by category, tag and words. */
export async function listPublicPosts(
  query: InsightsQuery,
): Promise<{ cards: PostCardData[]; total: number; page: number; pages: number }> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.posts);
  const db = await getDb();
  const where: SQL[] = [isPublic()];
  if (query.category) where.push(eq(postCategories.slug, query.category));
  if (query.tag)
    where.push(
      inArray(
        posts.id,
        db
          .select({ id: postTagLinks.postId })
          .from(postTagLinks)
          .innerJoin(postTags, eq(postTags.id, postTagLinks.tagId))
          .where(and(eq(postTags.agencyId, currentAgencyId()), eq(postTags.slug, query.tag))),
      ),
    );
  if (query.q) {
    const like = `%${query.q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push(
      or(ilike(posts.title, like), ilike(posts.excerpt, like), ilike(posts.bodyHtml, like))!,
    );
  }
  const condition = and(...where);
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(posts)
    .leftJoin(postCategories, eq(postCategories.id, posts.categoryId))
    .where(condition);
  const total = count?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / INSIGHTS_PAGE_SIZE));
  const page = Math.min(query.page, pages);
  const rows = await db
    .select(cardColumns)
    .from(posts)
    .leftJoin(postCategories, eq(postCategories.id, posts.categoryId))
    .where(condition)
    .orderBy(desc(posts.publishedAt), desc(posts.id))
    .limit(INSIGHTS_PAGE_SIZE)
    .offset((page - 1) * INSIGHTS_PAGE_SIZE);
  return { cards: await toCards(rows), total, page, pages };
}

export type PublicCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  posts: number;
  seo: {
    title: string | null;
    description: string | null;
    canonicalUrl: string | null;
    noindex: boolean;
    ogImageId: string | null;
  };
};

/** Every category with its number of published posts, in the admin's order. */
export async function publicCategories(): Promise<PublicCategory[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.posts);
  const db = await getDb();
  const rows = await db
    .select({
      id: postCategories.id,
      name: postCategories.name,
      slug: postCategories.slug,
      description: postCategories.description,
      seoTitle: postCategories.seoTitle,
      seoDescription: postCategories.seoDescription,
      canonicalUrl: postCategories.canonicalUrl,
      noindex: postCategories.noindex,
      ogImageId: postCategories.ogImageId,
    })
    .from(postCategories)
    .where(eq(postCategories.agencyId, currentAgencyId()))
    .orderBy(asc(postCategories.sortOrder), asc(postCategories.name));
  const counts = await db
    .select({ id: posts.categoryId, n: sql<number>`count(*)::int` })
    .from(posts)
    .where(and(isPublic(), isNotNull(posts.categoryId)))
    .groupBy(posts.categoryId);
  const published = new Map(counts.map((c) => [c.id, c.n]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    posts: published.get(r.id) ?? 0,
    seo: {
      title: r.seoTitle,
      description: r.seoDescription,
      canonicalUrl: r.canonicalUrl,
      noindex: r.noindex,
      ogImageId: r.ogImageId,
    },
  }));
}

export async function getPublicCategory(slug: string): Promise<PublicCategory | null> {
  return (await publicCategories()).find((c) => c.slug === slug) ?? null;
}

export type PostAuthor = {
  name: string;
  /** The agent's page, when the byline is a visible agent profile. */
  href: string | null;
  title: string | null;
  photo: PublicMedia | null;
};

export type PublicPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover: PublicMedia | null;
  category: { name: string; slug: string } | null;
  tags: Array<{ name: string; slug: string }>;
  author: PostAuthor | null;
  publishedAt: string;
  updatedAt: string;
  readingMinutes: number;
  wordCount: number;
  segments: PostSegment[];
  relatedPropertyIds: string[];
  related: PostCardData[];
  seo: {
    title: string | null;
    description: string | null;
    canonicalUrl: string | null;
    noindex: boolean;
    ogImageId: string | null;
  };
};

/** The post page: the post with its byline, body pieces, tags and up to three related posts. */
export async function getPublicPost(slug: string): Promise<PublicPost | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.posts);
  const db = await getDb();
  const [row] = await db
    .select({ post: posts, categoryName: postCategories.name, categorySlug: postCategories.slug })
    .from(posts)
    .leftJoin(postCategories, eq(postCategories.id, posts.categoryId))
    .where(and(isPublic(), eq(posts.slug, slug)))
    .limit(1);
  if (!row) return null;
  const p = row.post;
  cacheTag(tags.post(p.id));

  const tagRows = await db
    .select({ name: postTags.name, slug: postTags.slug })
    .from(postTagLinks)
    .innerJoin(postTags, eq(postTags.id, postTagLinks.tagId))
    .where(eq(postTagLinks.postId, p.id))
    .orderBy(asc(postTags.name));

  let author: PostAuthor | null = null;
  if (p.authorAgentId) {
    cacheTag(tags.agents);
    const [a] = await db
      .select({
        name: agents.name,
        slug: agents.slug,
        title: agents.title,
        photoId: agents.photoId,
        isActive: agents.isActive,
      })
      .from(agents)
      .where(eq(agents.id, p.authorAgentId));
    if (a)
      author = {
        name: a.name,
        href: a.isActive ? `/agents/${a.slug}` : null,
        title: a.title,
        photo: a.isActive ? await getPublicMedia(a.photoId) : null,
      };
  } else if (p.authorUserId) {
    const [u] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, p.authorUserId));
    if (u) author = { name: u.name, href: null, title: null, photo: null };
  }

  const { mediaIds } = postReferences(p.body);
  for (const id of mediaIds) cacheTag(tags.media(id));
  const segments = renderPostSegments(p.body, {
    media: await bodyMedia(db, mediaIds),
    siteOrigin: siteOrigin(),
  });

  // Related: the same category first, then the newest others.
  const sameCategory: SQL[] = p.categoryId
    ? [sql`(${posts.categoryId} = ${p.categoryId}) desc nulls last`]
    : [];
  const others = await db
    .select(cardColumns)
    .from(posts)
    .leftJoin(postCategories, eq(postCategories.id, posts.categoryId))
    .where(and(isPublic(), ne(posts.id, p.id)))
    .orderBy(...sameCategory, desc(posts.publishedAt), desc(posts.id))
    .limit(3);

  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    cover: await getPublicMedia(p.coverId),
    category:
      row.categoryName && row.categorySlug
        ? { name: row.categoryName, slug: row.categorySlug }
        : null,
    tags: tagRows,
    author,
    publishedAt: p.publishedAt!.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    readingMinutes: p.readingMinutes,
    wordCount: postWordCount(p.body),
    segments,
    relatedPropertyIds: p.relatedPropertyIds,
    related: await toCards(others),
    seo: {
      title: p.seoTitle,
      description: p.seoDescription,
      canonicalUrl: p.canonicalUrl,
      noindex: p.noindex,
      ogImageId: p.ogImageId,
    },
  };
}

/** Published posts by id, in the order given (an area guide's related posts). */
export async function publicPostCards(ids: string[]): Promise<PostCardData[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.posts);
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select(cardColumns)
    .from(posts)
    .leftJoin(postCategories, eq(postCategories.id, posts.categoryId))
    .where(and(isPublic(), inArray(posts.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return toCards(ids.flatMap((id) => byId.get(id) ?? []));
}

/** Counts a view of a published post (the post page's beacon). */
export async function countPostView(id: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(posts)
    .set({ viewsCount: sql`${posts.viewsCount} + 1`, updatedAt: sql`${posts.updatedAt}` })
    .where(and(eq(posts.id, id), isPublic()))
    .returning({ id: posts.id });
  return rows.length > 0;
}
