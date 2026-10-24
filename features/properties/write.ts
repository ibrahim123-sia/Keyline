import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import type { Tx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { properties } from "@/db/schema/properties";
import { queueBrochureRender } from "@/features/brochure/jobs";
import { tags } from "@/lib/cache-tags";
import { uniqueSlug } from "@/lib/slug";

/** Helpers for listing writes. Not a "use server" module: nothing here is a public endpoint. */

export async function propertySlug(tx: Tx, base: string, exceptId: string | null): Promise<string> {
  return uniqueSlug(base, async (candidates) => {
    const rows = await tx
      .select({ slug: properties.slug })
      .from(properties)
      .where(
        and(
          eq(properties.agencyId, currentAgencyId()),
          inArray(properties.slug, candidates),
          exceptId ? sql`${properties.id} <> ${exceptId}` : sql`true`,
        ),
      );
    return new Set(rows.map((r) => r.slug));
  });
}

/**
 * Expires what shows these listings: their pages, search, the sitemap and their projects; and
 * queues a fresh brochure for each (11 §4 "regenerated when the listing changes").
 */
export async function revalidateListings(
  ids: string[],
  projectIds: Array<string | null> = [],
): Promise<void> {
  for (const id of ids) updateTag(tags.listing(id));
  for (const id of new Set(projectIds)) if (id) updateTag(tags.project(id));
  updateTag(tags.listings);
  updateTag(tags.search);
  updateTag(tags.sitemap);
  await queueBrochureRender("property", ids);
}
