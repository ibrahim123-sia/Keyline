import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { properties } from "@/db/schema/properties";
import { liveStatuses } from "@/features/properties/status";
import { tags } from "@/lib/cache-tags";
import { loadListingCards, type ListingCardData } from "./cards";

/** Card data for live listings only, in the order asked (recently viewed, 06 §5.16). */
export async function publicCards(ids: string[]): Promise<ListingCardData[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(tags.listings);
  if (ids.length === 0) return [];
  const db = await getDb();
  const live = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.agencyId, currentAgencyId()),
        inArray(properties.id, ids),
        isNull(properties.deletedAt),
        inArray(properties.status, [...liveStatuses]),
      ),
    );
  const allowed = new Set(live.map((r) => r.id));
  return loadListingCards(
    db,
    ids.filter((id) => allowed.has(id)),
  );
}
