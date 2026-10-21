import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { postTagLinks, postTags, posts } from "@/db/schema/content";
import { postReferences } from "@/lib/rich-text-post";
import type { PostInput } from "./schema";

export type PostRow = typeof posts.$inferSelect;

/** A post as the editor edits it, or null when it is not this agency's. */
export async function loadPost(
  db: DbOrTx,
  id: string,
): Promise<{ row: PostRow; input: PostInput } | null> {
  const [row] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.agencyId, currentAgencyId())))
    .limit(1);
  if (!row) return null;
  const tagRows = await db
    .select({ name: postTags.name })
    .from(postTagLinks)
    .innerJoin(postTags, eq(postTags.id, postTagLinks.tagId))
    .where(eq(postTagLinks.postId, id))
    .orderBy(asc(postTags.name));
  return {
    row,
    input: {
      title: row.title,
      excerpt: row.excerpt,
      coverId: row.coverId,
      body: row.body,
      categoryId: row.categoryId,
      tags: tagRows.map((t) => t.name),
      authorAgentId: row.authorAgentId,
      authorUserId: row.authorUserId,
      relatedPropertyIds: row.relatedPropertyIds,
      slug: row.slug,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      canonicalUrl: row.canonicalUrl,
      noindex: row.noindex,
      ogImageId: row.ogImageId,
    },
  };
}

/** Library files a post uses (cover, share image, images in the text). */
export function postMediaIds(p: Pick<PostInput, "coverId" | "ogImageId" | "body">): string[] {
  return [p.coverId, p.ogImageId, ...postReferences(p.body).mediaIds].filter(
    (x): x is string => !!x,
  );
}
