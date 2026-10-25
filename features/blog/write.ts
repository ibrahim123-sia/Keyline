import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import type { DbOrTx } from "@/db/client";
import { embedAfterChange } from "@/features/ai/embeddings";
import { currentAgencyId } from "@/db/schema/_common";
import { postCategories, posts } from "@/db/schema/content";
import { tags } from "@/lib/cache-tags";
import { uniqueSlug } from "@/lib/slug";

/** Helpers for blog writes. Not a "use server" module: nothing here is a public endpoint. */

export async function postSlug(db: DbOrTx, base: string, exceptId: string | null): Promise<string> {
  return uniqueSlug(base, async (candidates) => {
    const rows = await db
      .select({ slug: posts.slug })
      .from(posts)
      .where(
        and(
          eq(posts.agencyId, currentAgencyId()),
          inArray(posts.slug, candidates),
          exceptId ? sql`${posts.id} <> ${exceptId}` : sql`true`,
        ),
      );
    return new Set(rows.map((r) => r.slug));
  });
}

export async function categorySlug(
  db: DbOrTx,
  base: string,
  exceptId: string | null,
): Promise<string> {
  return uniqueSlug(base, async (candidates) => {
    const rows = await db
      .select({ slug: postCategories.slug })
      .from(postCategories)
      .where(
        and(
          eq(postCategories.agencyId, currentAgencyId()),
          inArray(postCategories.slug, candidates),
          exceptId ? sql`${postCategories.id} <> ${exceptId}` : sql`true`,
        ),
      );
    return new Set(rows.map((r) => r.slug));
  });
}

/** Expires what shows posts: the post, lists, category pages, area guides and the sitemap. */
export function revalidatePost(id: string | null): void {
  embedAfterChange("post", [id]);
  if (id) updateTag(tags.post(id));
  updateTag(tags.posts);
  updateTag(tags.sitemap);
}
