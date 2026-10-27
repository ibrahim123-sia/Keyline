import "server-only";
import { and, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { properties, type PropertyStatus } from "@/db/schema/properties";
import { isLiveStatus, statusLabels } from "@/features/properties/status";

/** A listing as the content pickers show it (listing cards, related homes, testimonials). */
export type ListingOption = { id: string; label: string; status: string; live: boolean };

const columns = {
  id: properties.id,
  reference: properties.reference,
  title: properties.title,
  status: properties.status,
};

const toOption = (r: {
  id: string;
  reference: string;
  title: string;
  status: PropertyStatus;
}): ListingOption => ({
  id: r.id,
  label: `${r.reference} · ${r.title}`,
  status: statusLabels[r.status],
  live: isLiveStatus(r.status),
});

/** These listings of the agency (deleted ones are left out), in the order given. */
export async function listingOptionsById(db: DbOrTx, ids: string[]): Promise<ListingOption[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await db
    .select(columns)
    .from(properties)
    .where(
      and(
        eq(properties.agencyId, currentAgencyId()),
        inArray(properties.id, unique),
        isNull(properties.deletedAt),
      ),
    );
  const byId = new Map(rows.map((r) => [r.id, toOption(r)]));
  return unique.flatMap((id) => byId.get(id) ?? []);
}

/** Listings whose reference or title contains the words, most recently changed first. */
export async function searchListingOptions(
  db: DbOrTx,
  q: string,
  limit = 12,
): Promise<ListingOption[]> {
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db
    .select(columns)
    .from(properties)
    .where(
      and(
        eq(properties.agencyId, currentAgencyId()),
        isNull(properties.deletedAt),
        q ? or(ilike(properties.reference, like), ilike(properties.title, like)) : undefined,
      ),
    )
    .orderBy(desc(properties.updatedAt))
    .limit(limit);
  return rows.map(toOption);
}
