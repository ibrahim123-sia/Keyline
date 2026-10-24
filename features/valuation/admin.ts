import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { listingRequests, valuationRequests } from "@/db/schema/crm";
import { locations, propertyTypes } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { properties } from "@/db/schema/properties";
import { loadSettings } from "@/features/settings/queries";
import { formatMoney } from "@/lib/money";
import { conditionLabel, homeSummary, rangeText, upgradeLabels } from "./format";

export type OwnerRequestCard = {
  id: string;
  kind: "valuation" | "listing";
  createdAt: string;
  purpose: "sell" | "rent";
  home: string;
  condition: string | null;
  upgrades: string[];
  notes: string | null;
  /** "AED 1,970,000 – AED 2,270,000" or null (no estimate / not a valuation). */
  estimate: string | null;
  comparables: number;
  askingPrice: string | null;
  availableFrom: string | null;
  photos: Array<{ id: string; url: string; status: string }>;
  /** The draft listing made from a listing request. */
  draft: { id: string; reference: string } | null;
};

/** A lead's valuation and listing requests for its page (09 §4, 11 §5-6), newest first. */
export async function loadOwnerRequests(db: DbOrTx, leadId: string): Promise<OwnerRequestCard[]> {
  const agency = currentAgencyId();
  const market = await loadSettings("market", db);
  const [vals, lists] = [
    await db
      .select()
      .from(valuationRequests)
      .where(and(eq(valuationRequests.leadId, leadId), eq(valuationRequests.agencyId, agency)))
      .orderBy(desc(valuationRequests.createdAt)),
    await db
      .select()
      .from(listingRequests)
      .where(and(eq(listingRequests.leadId, leadId), eq(listingRequests.agencyId, agency)))
      .orderBy(desc(listingRequests.createdAt)),
  ];
  const all = [
    ...vals.map((r) => ({ kind: "valuation" as const, r, l: null })),
    ...lists.map((r) => ({ kind: "listing" as const, r, l: r })),
  ];
  if (all.length === 0) return [];
  const ids = <T>(xs: Array<T | null>) => [...new Set(xs.filter((x): x is T => x != null))];
  const locIds = ids(all.map((x) => x.r.locationId));
  const typeIds = ids(all.map((x) => x.r.propertyTypeId));
  const photoIds = ids(all.flatMap((x) => x.r.photoIds));
  const draftIds = ids(lists.map((r) => r.propertyId));
  const [locs, types, photos, drafts] = [
    locIds.length
      ? await db
          .select({ id: locations.id, name: locations.name })
          .from(locations)
          .where(inArray(locations.id, locIds))
      : [],
    typeIds.length
      ? await db
          .select({ id: propertyTypes.id, name: propertyTypes.name })
          .from(propertyTypes)
          .where(inArray(propertyTypes.id, typeIds))
      : [],
    photoIds.length
      ? await db
          .select({ id: media.id, key: media.r2Key, status: media.status })
          .from(media)
          .where(inArray(media.id, photoIds))
      : [],
    draftIds.length
      ? await db
          .select({ id: properties.id, reference: properties.reference })
          .from(properties)
          .where(inArray(properties.id, draftIds))
      : [],
  ];
  const name = (list: Array<{ id: string; name: string }>, id: string | null) =>
    list.find((x) => x.id === id)?.name ?? null;
  const currency = market.baseCurrency;
  return all
    .map(({ kind, r, l }) => {
      const period = r.purpose === "rent" ? market.rentPeriod : null;
      return {
        id: r.id,
        kind,
        createdAt: r.createdAt.toISOString(),
        purpose: r.purpose,
        home: homeSummary(
          {
            typeName: name(types, r.propertyTypeId),
            beds: r.beds,
            size: r.size,
            building: r.building,
            areaName: name(locs, r.locationId),
          },
          market.areaUnit,
        ),
        condition: conditionLabel(r.condition),
        upgrades: upgradeLabels(r.upgrades),
        notes: r.notes,
        estimate:
          r.aiRangeMin != null && r.aiRangeMax != null
            ? rangeText(r.aiRangeMin, r.aiRangeMax, currency, period)
            : null,
        comparables: r.aiComparableIds.length,
        askingPrice: l?.askingPrice != null ? formatMoney(l.askingPrice, currency) : null,
        availableFrom: l?.availableFrom ?? null,
        photos: r.photoIds
          .map((id) => photos.find((p) => p.id === id))
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
          .map((p) => ({
            id: p.id,
            url: p.status === "ready" ? `/media/${p.key}` : "",
            status: p.status,
          })),
        draft: drafts.find((d) => d.id === l?.propertyId) ?? null,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
