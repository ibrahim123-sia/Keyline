import "server-only";
import { and, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { locations } from "@/db/schema/master-data";
import { properties } from "@/db/schema/properties";
import type { ComparableCandidate, ValuationPurpose } from "./estimate";

/** Live listings and closed deals (sold, rented) can be comparables; drafts and off-market not. */
export const comparableStatuses = [
  "available",
  "reserved",
  "under_offer",
  "sold",
  "rented",
] as const;

/** A location and every location inside it (a district covers its communities and buildings). */
export async function locationAndBelow(db: DbOrTx, locationId: string): Promise<string[]> {
  const res = await db.execute<{ id: string }>(sql`
    with recursive down as (
      select id from locations where id = ${locationId}::uuid and agency_id = ${currentAgencyId()}
      union
      select l.id from locations l join down d on l.parent_id = d.id
    )
    select id from down`);
  return res.rows.map((r) => r.id);
}

export type ComparableListing = ComparableCandidate & {
  title: string;
  slug: string;
  status: string;
  locationName: string | null;
};

/** Rent in the market's period: a monthly rent is a twelfth of a yearly one. */
export function rentInPeriod(
  price: number,
  listed: "year" | "month" | null,
  market: "year" | "month",
): number {
  const from = listed ?? market;
  if (from === market) return price;
  return from === "month" ? price * 12 : Math.round(price / 12);
}

/**
 * The agency's listings that could compare with a home: same purpose and type, inside the
 * area, priced in the base currency with a size. The pure estimate picks the comparables.
 */
export async function loadComparableCandidates(
  db: DbOrTx,
  input: {
    purpose: ValuationPurpose;
    propertyTypeId: string;
    locationIds: string[];
    currency: string;
    rentPeriod: "year" | "month";
  },
): Promise<ComparableListing[]> {
  if (input.locationIds.length === 0) return [];
  const rows = await db
    .select({
      id: properties.id,
      title: properties.title,
      slug: properties.slug,
      status: properties.status,
      purpose: properties.purpose,
      propertyTypeId: properties.propertyTypeId,
      locationId: properties.locationId,
      locationName: locations.name,
      beds: properties.beds,
      size: properties.size,
      price: properties.price,
      pricePeriod: properties.pricePeriod,
    })
    .from(properties)
    .leftJoin(locations, eq(locations.id, properties.locationId))
    .where(
      and(
        eq(properties.agencyId, currentAgencyId()),
        isNull(properties.deletedAt),
        isNotNull(properties.publishedAt),
        inArray(properties.status, [...comparableStatuses]),
        eq(properties.purpose, input.purpose),
        eq(properties.propertyTypeId, input.propertyTypeId),
        inArray(properties.locationId, input.locationIds),
        eq(properties.priceOnRequest, false),
        eq(properties.currency, input.currency),
        gt(properties.price, 0),
        gt(properties.size, 0),
      ),
    )
    .limit(500);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    status: r.status,
    purpose: r.purpose,
    propertyTypeId: r.propertyTypeId,
    locationId: r.locationId,
    locationName: r.locationName,
    beds: r.beds,
    size: r.size,
    price:
      r.price == null
        ? null
        : r.purpose === "rent"
          ? rentInPeriod(r.price, r.pricePeriod, input.rentPeriod)
          : r.price,
  }));
}
