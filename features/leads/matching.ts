import "server-only";
import { and, eq, inArray, isNotNull, isNull, notInArray, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { properties } from "@/db/schema/properties";
import { searchableStatuses } from "@/features/properties/status";
import { priceInBase } from "@/features/search/query";
import type { SettingsOf } from "@/features/settings/schema";
import { hasCriteria, type MatchCriteria } from "./match-criteria";

/**
 * Live listings that fit a lead's requirements (09 §4 "matching listings"): purpose, the
 * places they named and everything inside them, types, at least the bedrooms, and the budget
 * (base currency, 10% either side). Closest price first. Returns ids.
 */
export async function matchingListingIds(
  db: DbOrTx,
  c: MatchCriteria,
  market: SettingsOf<"market">,
  options: { exclude?: string[]; limit?: number } = {},
): Promise<string[]> {
  if (!hasCriteria(c)) return [];
  const agency = currentAgencyId();
  const p = properties;
  const where: SQL[] = [
    eq(p.agencyId, agency),
    isNull(p.deletedAt),
    isNotNull(p.publishedAt),
    inArray(p.status, [...searchableStatuses]),
  ];
  if (c.purpose) where.push(eq(p.purpose, c.purpose));
  if (c.locationIds.length)
    where.push(sql`${p.locationId} in (
      with recursive sub as (
        select id from locations where agency_id = ${agency} and id in (${sql.join(
          c.locationIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
        union all
        select l.id from locations l join sub on l.parent_id = sub.id
      ) select id from sub)`);
  if (c.propertyTypeIds.length) where.push(inArray(p.propertyTypeId, c.propertyTypeIds));
  if (c.bedsMin !== null) where.push(sql`${p.beds} >= ${c.bedsMin}`);
  const price = priceInBase(market);
  if (c.minBase !== null || c.maxBase !== null) {
    where.push(sql`${p.priceOnRequest} = false and ${p.price} is not null`);
    if (c.minBase !== null) where.push(sql`${price} >= ${Math.round(c.minBase * 0.9)}`);
    if (c.maxBase !== null) where.push(sql`${price} <= ${Math.round(c.maxBase * 1.1)}`);
  }
  if (options.exclude?.length) where.push(notInArray(p.id, options.exclude));
  const mid =
    c.minBase !== null && c.maxBase !== null
      ? Math.round((c.minBase + c.maxBase) / 2)
      : (c.maxBase ?? c.minBase);
  const rows = await db
    .select({ id: p.id })
    .from(p)
    .where(and(...where))
    .orderBy(mid !== null ? sql`abs(${price} - ${mid}) asc nulls last` : sql`${p.publishedAt} desc`)
    .limit(options.limit ?? 6);
  return rows.map((r) => r.id);
}
