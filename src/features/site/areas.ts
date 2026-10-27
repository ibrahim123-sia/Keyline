import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { locations } from "@/db/schema/master-data";
import { tags } from "@/lib/cache-tags";

/** Featured areas (Setup -> Locations), for the 404 page and other "popular areas" links. */
export async function getPopularAreas(limit = 8): Promise<Array<{ name: string; slug: string }>> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.locations);
  const db = await getDb();
  return db
    .select({ name: locations.name, slug: locations.slug })
    .from(locations)
    .where(
      and(
        eq(locations.agencyId, currentAgencyId()),
        eq(locations.isFeatured, true),
        inArray(locations.level, ["city", "area", "community"]),
      ),
    )
    .orderBy(asc(locations.name))
    .limit(limit);
}
