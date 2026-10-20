import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import type { Tx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { projects } from "@/db/schema/projects";
import { tags } from "@/lib/cache-tags";
import { uniqueSlug } from "@/lib/slug";

/** Helpers for project writes. Not a "use server" module: nothing here is a public endpoint. */

export async function projectSlug(tx: Tx, base: string, exceptId: string | null): Promise<string> {
  return uniqueSlug(base, async (candidates) => {
    const rows = await tx
      .select({ slug: projects.slug })
      .from(projects)
      .where(
        and(
          eq(projects.agencyId, currentAgencyId()),
          inArray(projects.slug, candidates),
          exceptId ? sql`${projects.id} <> ${exceptId}` : sql`true`,
        ),
      );
    return new Set(rows.map((r) => r.slug));
  });
}

/** Expires what shows a project: its page, project lists, search, the sitemap and its listings. */
export function revalidateProject(id: string): void {
  updateTag(tags.project(id));
  updateTag(tags.projects);
  updateTag(tags.listings);
  updateTag(tags.search);
  updateTag(tags.sitemap);
}
