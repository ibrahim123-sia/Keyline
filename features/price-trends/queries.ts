import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { locations, propertyTypes } from "@/db/schema/master-data";
import { areaPriceStats } from "@/db/schema/stats";
import { tags } from "@/lib/cache-tags";
import { summarise, type StatPoint, type TrendSummary } from "./series";

export type PriceTrends = {
  locationName: string;
  currency: string;
  /** typeName: the type the figures are for when it had enough data; null is all types. */
  sale: TrendSummary & { typeName: string | null };
  rent: TrendSummary & { typeName: string | null };
};

async function points(
  db: DbOrTx,
  locationId: string,
  purpose: "sale" | "rent",
  typeId: string | null,
): Promise<StatPoint[]> {
  const rows = await db
    .select({
      period: areaPriceStats.period,
      source: areaPriceStats.source,
      value: areaPriceStats.medianPricePerArea,
      listingsCount: areaPriceStats.listingsCount,
      avgDaysOnMarket: areaPriceStats.avgDaysOnMarket,
      sourceNote: areaPriceStats.sourceNote,
    })
    .from(areaPriceStats)
    .where(
      and(
        eq(areaPriceStats.agencyId, currentAgencyId()),
        eq(areaPriceStats.locationId, locationId),
        eq(areaPriceStats.purpose, purpose),
        typeId ? eq(areaPriceStats.propertyTypeId, typeId) : isNull(areaPriceStats.propertyTypeId),
      ),
    )
    .orderBy(asc(areaPriceStats.period));
  return rows;
}

/**
 * Price trends for a location (11 §7): sale and rent, all types, or one type when it has
 * enough figures (property pages pass the listing's type). Cached; the monthly job and the
 * admin editor expire the tag.
 */
export async function getPriceTrends(
  locationId: string,
  typeSlug: string | null = null,
): Promise<PriceTrends | null> {
  "use cache";
  cacheLife("days");
  cacheTag(tags.priceStats, tags.locations);
  const db = await getDb();
  const agency = currentAgencyId();
  const [location] = await db
    .select({ name: locations.name })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.agencyId, agency)));
  if (!location) return null;
  const [type] = typeSlug
    ? await db
        .select({ id: propertyTypes.id, name: propertyTypes.name })
        .from(propertyTypes)
        .where(and(eq(propertyTypes.slug, typeSlug), eq(propertyTypes.agencyId, agency)))
    : [];
  const pick = async (purpose: "sale" | "rent") => {
    if (type) {
      const typed = summarise(await points(db, locationId, purpose, type.id));
      if (typed.series.length > 0) return { summary: typed, typed: true };
    }
    return { summary: summarise(await points(db, locationId, purpose, null)), typed: false };
  };
  const [sale, rent] = [await pick("sale"), await pick("rent")];
  const [{ currency } = { currency: "" }] = await db
    .select({ currency: areaPriceStats.currency })
    .from(areaPriceStats)
    .where(and(eq(areaPriceStats.agencyId, agency), eq(areaPriceStats.locationId, locationId)))
    .limit(1);
  return {
    locationName: location.name,
    currency,
    sale: { ...sale.summary, typeName: sale.typed && type ? type.name : null },
    rent: { ...rent.summary, typeName: rent.typed && type ? type.name : null },
  };
}
