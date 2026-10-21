import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { users } from "@/db/schema/auth";
import {
  contentStatuses,
  postCategories,
  postTagLinks,
  postTags,
  posts,
  type ContentStatus,
} from "@/db/schema/content";
import { media } from "@/db/schema/media";
import { agents } from "@/db/schema/people";
import { listingOptionsById, type ListingOption } from "@/features/content/listing-options";
import { mediaUrl } from "@/features/media/queries";
import type { TableParams } from "@/lib/table-params";
import { loadPost } from "./load";
import type { CategoryInput, PostInput } from "./schema";

export const postSortable = ["updated", "published", "title", "views"] as const;
export type PostSort = (typeof postSortable)[number];

export type PostListRow = {
  id: string;
  title: string;
  slug: string;
  status: ContentStatus;
  publishAt: string | null;
  publishedAt: string | null;
  categoryName: string | null;
  author: string | null;
  viewsCount: number;
  readingMinutes: number;
  isAiDrafted: boolean;
  coverUrl: string | null;
  updatedAt: string;
};

const uuid = /^[0-9a-f-]{36}$/i;

export function postFilters(params: Pick<TableParams<string>, "q" | "get">): SQL[] {
  const where: SQL[] = [eq(posts.agencyId, currentAgencyId()), isNull(posts.deletedAt)];
  const status = params.get("status");
  if (status && (contentStatuses as readonly string[]).includes(status))
    where.push(eq(posts.status, status as ContentStatus));
  const category = params.get("category");
  if (category === "none") where.push(isNull(posts.categoryId));
  else if (category && uuid.test(category)) where.push(eq(posts.categoryId, category));
  if (params.get("ai") === "1") where.push(eq(posts.isAiDrafted, true));
  if (params.q) {
    const like = `%${params.q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push(or(ilike(posts.title, like), ilike(posts.slug, like))!);
  }
  return where;
}

/** Admin -> Website -> Blog: posts with status, category, author, publish date and views. */
export async function listPosts(
  params: TableParams<PostSort>,
  db?: DbOrTx,
): Promise<{ rows: PostListRow[]; total: number }> {
  const conn = db ?? (await getDb());
  const where = and(...postFilters(params));
  const d = params.sort.desc;
  const order: SQL[] = (() => {
    switch (params.sort.id) {
      case "title":
        return [d ? desc(posts.title) : asc(posts.title)];
      case "views":
        return [d ? desc(posts.viewsCount) : asc(posts.viewsCount)];
      case "published":
        return [
          d
            ? sql`coalesce(${posts.publishedAt}, ${posts.publishAt}) desc nulls last`
            : sql`coalesce(${posts.publishedAt}, ${posts.publishAt}) asc nulls last`,
        ];
      default:
        return [d ? desc(posts.updatedAt) : asc(posts.updatedAt)];
    }
  })();
  const rows = await conn
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      status: posts.status,
      publishAt: posts.publishAt,
      publishedAt: posts.publishedAt,
      viewsCount: posts.viewsCount,
      readingMinutes: posts.readingMinutes,
      isAiDrafted: posts.isAiDrafted,
      updatedAt: posts.updatedAt,
      categoryName: postCategories.name,
      agentName: agents.name,
      userName: users.name,
      coverKey: media.r2Key,
    })
    .from(posts)
    .leftJoin(postCategories, eq(postCategories.id, posts.categoryId))
    .leftJoin(agents, eq(agents.id, posts.authorAgentId))
    .leftJoin(users, eq(users.id, posts.authorUserId))
    .leftJoin(media, and(eq(media.id, posts.coverId), eq(media.status, "ready")))
    .where(where)
    .orderBy(...order, desc(posts.id))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);
  const [totalRow] = await conn
    .select({ n: sql<number>`count(*)::int` })
    .from(posts)
    .where(where);
  return {
    total: totalRow?.n ?? 0,
    rows: rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      status: r.status,
      publishAt: r.publishAt?.toISOString() ?? null,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      categoryName: r.categoryName,
      author: r.agentName ?? r.userName,
      viewsCount: r.viewsCount,
      readingMinutes: r.readingMinutes,
      isAiDrafted: r.isAiDrafted,
      coverUrl: r.coverKey ? mediaUrl(r.coverKey) : null,
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}

export type CategoryOption = { id: string; name: string };

export async function categoryOptions(db: DbOrTx): Promise<CategoryOption[]> {
  return db
    .select({ id: postCategories.id, name: postCategories.name })
    .from(postCategories)
    .where(eq(postCategories.agencyId, currentAgencyId()))
    .orderBy(asc(postCategories.sortOrder), asc(postCategories.name));
}

export type BylineOptions = {
  agents: Array<{ id: string; name: string; isActive: boolean }>;
  users: Array<{ id: string; name: string }>;
};

/** Who a post can be by: agent profiles and admin users (08 §3 "author"). */
export async function bylineOptions(db: DbOrTx): Promise<BylineOptions> {
  const agentRows = await db
    .select({ id: agents.id, name: agents.name, isActive: agents.isActive })
    .from(agents)
    .where(eq(agents.agencyId, currentAgencyId()))
    .orderBy(asc(agents.sortOrder), asc(agents.name));
  const userRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(
      and(
        eq(users.agencyId, currentAgencyId()),
        eq(users.role, "admin"),
        eq(users.isActive, true),
        eq(users.readOnly, false),
      ),
    )
    .orderBy(asc(users.name));
  return { agents: agentRows, users: userRows };
}

export type PostEditorData = {
  id: string;
  input: PostInput;
  status: ContentStatus;
  publishAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  readingMinutes: number;
  viewsCount: number;
  isAiDrafted: boolean;
  options: {
    categories: CategoryOption[];
    bylines: BylineOptions;
    tags: string[];
    related: ListingOption[];
  };
};

export async function loadPostEditorData(db: DbOrTx, id: string): Promise<PostEditorData | null> {
  const loaded = await loadPost(db, id);
  if (!loaded || loaded.row.deletedAt) return null;
  const { row, input } = loaded;
  const tagRows = await db
    .select({ name: postTags.name })
    .from(postTags)
    .where(eq(postTags.agencyId, currentAgencyId()))
    .orderBy(asc(postTags.name))
    .limit(500);
  return {
    id: row.id,
    input,
    status: row.status,
    publishAt: row.publishAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    readingMinutes: row.readingMinutes,
    viewsCount: row.viewsCount,
    isAiDrafted: row.isAiDrafted,
    options: {
      categories: await categoryOptions(db),
      bylines: await bylineOptions(db),
      tags: tagRows.map((t) => t.name),
      related: await listingOptionsById(db, input.relatedPropertyIds),
    },
  };
}

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  posts: number;
  published: number;
  data: CategoryInput;
};

/** Categories with how many posts each has (the Categories tab). */
export async function listCategories(db: DbOrTx): Promise<CategoryRow[]> {
  const rows = await db
    .select()
    .from(postCategories)
    .where(eq(postCategories.agencyId, currentAgencyId()))
    .orderBy(asc(postCategories.sortOrder), asc(postCategories.name));
  const counts = rows.length
    ? await db
        .select({
          categoryId: posts.categoryId,
          total: sql<number>`count(*)::int`,
          published: sql<number>`(count(*) filter (where ${posts.status} = 'published'))::int`,
        })
        .from(posts)
        .where(
          and(
            inArray(
              posts.categoryId,
              rows.map((r) => r.id),
            ),
            isNull(posts.deletedAt),
          ),
        )
        .groupBy(posts.categoryId)
    : [];
  const byId = new Map(counts.map((c) => [c.categoryId, c]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    posts: byId.get(r.id)?.total ?? 0,
    published: byId.get(r.id)?.published ?? 0,
    data: {
      name: r.name,
      slug: r.slug,
      description: r.description,
      seoTitle: r.seoTitle,
      seoDescription: r.seoDescription,
      canonicalUrl: r.canonicalUrl,
      noindex: r.noindex,
      ogImageId: r.ogImageId,
    },
  }));
}

export type TagRow = { id: string; name: string; slug: string; posts: number };

export async function listTags(db: DbOrTx): Promise<TagRow[]> {
  const rows = await db
    .select({ id: postTags.id, name: postTags.name, slug: postTags.slug })
    .from(postTags)
    .where(eq(postTags.agencyId, currentAgencyId()))
    .orderBy(asc(postTags.name));
  const counts = rows.length
    ? await db
        .select({ id: postTagLinks.tagId, n: sql<number>`count(*)::int` })
        .from(postTagLinks)
        .where(
          inArray(
            postTagLinks.tagId,
            rows.map((r) => r.id),
          ),
        )
        .groupBy(postTagLinks.tagId)
    : [];
  const byId = new Map(counts.map((c) => [c.id, c.n]));
  return rows.map((r) => ({ ...r, posts: byId.get(r.id) ?? 0 }));
}
