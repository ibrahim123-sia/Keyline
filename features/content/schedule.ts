import "server-only";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { areaGuides, posts } from "@/db/schema/content";
import { queueEmbedding } from "@/features/ai/embeddings";
import { writeAudit } from "@/lib/audit";
import { tags } from "@/lib/cache-tags";
import { expireTags } from "@/lib/expire-tags";

const system = { type: "system", id: null } as const;

/**
 * Scheduled posts and area guides go on the site once their time has come (the cron runs
 * this every minute). The publish rules were checked when they were scheduled and on every
 * save since, so nothing is checked again here.
 */
export async function publishDueContent(
  db: DbOrTx,
  now = new Date(),
): Promise<{ posts: number; guides: number }> {
  const due = sql`${now.toISOString()}::timestamptz`;
  const duePosts = await db
    .update(posts)
    .set({
      status: "published",
      publishedAt: sql`coalesce(${posts.publishedAt}, ${posts.publishAt})`,
      publishAt: null,
      updatedAt: sql`${posts.updatedAt}`,
    })
    .where(
      and(
        eq(posts.agencyId, currentAgencyId()),
        eq(posts.status, "scheduled"),
        lte(posts.publishAt, due),
        isNull(posts.deletedAt),
      ),
    )
    .returning({ id: posts.id, publishedAt: posts.publishedAt });
  for (const p of duePosts)
    await writeAudit(db, {
      actor: system,
      action: "post.publish",
      entityType: "post",
      entityId: p.id,
      after: { status: "published", publishedAt: p.publishedAt, reason: "Scheduled time reached" },
    });

  const dueGuides = await db
    .update(areaGuides)
    .set({
      status: "published",
      publishedAt: sql`coalesce(${areaGuides.publishedAt}, ${areaGuides.publishAt})`,
      publishAt: null,
      updatedAt: sql`${areaGuides.updatedAt}`,
    })
    .where(
      and(
        eq(areaGuides.agencyId, currentAgencyId()),
        eq(areaGuides.status, "scheduled"),
        lte(areaGuides.publishAt, due),
        isNull(areaGuides.deletedAt),
      ),
    )
    .returning({ id: areaGuides.id, publishedAt: areaGuides.publishedAt });
  for (const g of dueGuides)
    await writeAudit(db, {
      actor: system,
      action: "area_guide.publish",
      entityType: "area_guide",
      entityId: g.id,
      after: { status: "published", publishedAt: g.publishedAt, reason: "Scheduled time reached" },
    });

  await queueEmbedding(
    "post",
    duePosts.map((p) => p.id),
    { db },
  );
  await queueEmbedding(
    "area_guide",
    dueGuides.map((g) => g.id),
    { db },
  );
  if (duePosts.length) expireTags(tags.posts, ...duePosts.map((p) => tags.post(p.id)));
  if (dueGuides.length) expireTags(tags.areaGuides, ...dueGuides.map((g) => tags.areaGuide(g.id)));
  if (duePosts.length || dueGuides.length) expireTags(tags.sitemap);
  return { posts: duePosts.length, guides: dueGuides.length };
}
