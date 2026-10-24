import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { getSettings } from "@/features/settings/queries";
import { tags } from "@/lib/cache-tags";
import { areaFromSqm } from "@/lib/units";
import type { RoiTypical } from "./calculator-params";

/** Two significant figures, rounded up: 2,312,345.00 → 2,400,000.00 (minor units in and out). */
function roundNice(minor: number): number {
  if (minor <= 0) return 0;
  const digits = Math.floor(Math.log10(minor)) + 1;
  const step = 10 ** Math.max(0, digits - 2);
  return Math.ceil(minor / step) * step;
}

/**
 * Starting numbers for an empty calculator, from the agency's own live sale listings in the
 * base currency (no market is assumed): the median price, the median expected yield applied to
 * it, and the median size in the market's area unit. Zeros when there are no listings.
 */
export async function typicalSale(): Promise<RoiTypical> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.listings, tags.settings("market"));
  const market = await getSettings("market");
  const db = await getDb();
  const res = await db.execute<{
    price: string | number | null;
    yield_pct: string | number | null;
    size: string | number | null;
  }>(sql`
    select
      percentile_disc(0.5) within group (order by price) as price,
      percentile_disc(0.5) within group (order by expected_yield) as yield_pct,
      percentile_disc(0.5) within group (order by size) as size
    from properties
    where agency_id = ${currentAgencyId()} and deleted_at is null and published_at is not null
      and purpose = 'sale' and price is not null and price_on_request = false and price > 0
      and currency = ${market.baseCurrency.code}
      and status in ('available', 'reserved', 'under_offer')`);
  const row = res.rows[0];
  const price = roundNice(Number(row?.price ?? 0));
  const yieldPct = Number(row?.yield_pct ?? 0);
  const sqm = Number(row?.size ?? 0);
  return {
    price,
    rentYearly: price > 0 && yieldPct > 0 ? roundNice(Math.round((price * yieldPct) / 100)) : 0,
    size: sqm > 0 ? Math.round(areaFromSqm(sqm, market.areaUnit)) : 0,
  };
}
