import "server-only";
import { and, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { pages } from "@/db/schema/cms";
import { writeAudit } from "@/lib/audit";
import { tags } from "@/lib/cache-tags";
import { expireTags } from "@/lib/expire-tags";
import { clearRedirectFrom, loadPageRow, publishPageRecord } from "./page-store";

const system = { type: "system", id: null } as const;

/**
 * Scheduled publishing (08 §1), run every minute by the cron: draft pages whose time has come
 * go live, and so do the scheduled changes of live pages. A page that can no longer be
 * published (a section was left unfinished) is taken off the schedule and the reason audited.
 */
export async function publishDuePages(
  db: Db,
  now = new Date(),
): Promise<{ published: number; failed: number }> {
  const due = await db
    .select({ id: pages.id })
    .from(pages)
    .where(
      and(
        eq(pages.agencyId, currentAgencyId()),
        isNull(pages.deletedAt),
        isNotNull(pages.publishAt),
        lte(pages.publishAt, sql`${now.toISOString()}::timestamptz`),
        inArray(pages.status, ["scheduled", "published"]),
      ),
    );
  let published = 0;
  let failed = 0;
  const changed: string[] = [];
  for (const { id } of due) {
    try {
      const done = await db.transaction(async (tx) => {
        const row = await loadPageRow(tx, id);
        // Changed since the list was read (published by hand, schedule cancelled).
        if (!row || row.deletedAt || !row.publishAt || row.publishAt > now) return false;
        if (row.status === "published" && row.draftSections === null) {
          await tx.update(pages).set({ publishAt: null }).where(eq(pages.id, id));
          return false;
        }
        const after = await publishPageRecord(tx, row, {
          actor: system,
          userId: null,
          reason: "Scheduled",
        });
        await clearRedirectFrom(tx, after.slug);
        return true;
      });
      if (done) {
        published++;
        changed.push(id);
      }
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      await db.transaction(async (tx) => {
        const row = await loadPageRow(tx, id);
        if (!row) return;
        await tx
          .update(pages)
          .set({ publishAt: null, status: row.status === "scheduled" ? "draft" : row.status })
          .where(eq(pages.id, id));
        await writeAudit(tx, {
          actor: system,
          action: "page.schedule_failed",
          entityType: "page",
          entityId: id,
          before: { status: row.status, publishAt: row.publishAt },
          after: { error: message },
        });
      });
    }
  }
  if (changed.length)
    expireTags(tags.pages, tags.sitemap, tags.redirects, ...changed.map((id) => tags.page(id)));
  return { published, failed };
}
