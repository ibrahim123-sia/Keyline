import "server-only";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { properties } from "@/db/schema/properties";
import { writeAudit } from "@/lib/audit";
import { tags } from "@/lib/cache-tags";
import { refreshAllAutoBadges } from "./badges";
import { expireTags } from "@/lib/expire-tags";

const system = { type: "system", id: null } as const;

/**
 * Daily listing upkeep: "Featured until" dates end the featuring, and automatic badges start
 * or end with their rules ("New" for 14 days after publishing, 05 §3).
 */
export async function dailyListingMaintenance(
  db: DbOrTx,
  now = new Date(),
): Promise<{ unfeatured: number; listings: number }> {
  const ended = await db
    .update(properties)
    .set({ isFeatured: false })
    .where(
      and(
        eq(properties.agencyId, currentAgencyId()),
        eq(properties.isFeatured, true),
        isNull(properties.deletedAt),
        lt(properties.featuredUntil, sql`${now.toISOString()}::timestamptz`),
      ),
    )
    .returning({ id: properties.id, featuredUntil: properties.featuredUntil });
  for (const row of ended)
    await writeAudit(db, {
      actor: system,
      action: "property.feature",
      entityType: "property",
      entityId: row.id,
      before: { isFeatured: true },
      after: { isFeatured: false, reason: "Featured until date passed" },
    });
  const listings = await refreshAllAutoBadges(db, now);
  expireTags(tags.listings, tags.search);
  return { unfeatured: ended.length, listings };
}
