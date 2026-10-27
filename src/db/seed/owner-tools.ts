import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../client";
import { currentAgencyId } from "../schema/_common";
import { leads, listingRequests, valuationRequests } from "../schema/crm";
import { areaPriceStats } from "../schema/stats";
import { computeAgencyPriceStats, monthOf, previousMonth } from "@/features/price-trends/compute";
import { loadSettings } from "@/features/settings/queries";
import { loadComparableCandidates, locationAndBelow } from "@/features/valuation/comparables";
import { estimateValuation } from "@/features/valuation/estimate";
import { localDateString } from "@/lib/local-date";
import { rng } from "./rng";

export const DEMO_PRICE_NOTE = "Sample data for demo";

/**
 * Demo valuation and list-your-property requests (11 §5-6) for the seeded owner leads, with
 * the estimate worked out by the real method from the seeded listings.
 */
export async function seedOwnerRequests(db: Db): Promise<{ valuations: number; listings: number }> {
  const market = await loadSettings("market", db);
  const owners = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.agencyId, currentAgencyId()),
        inArray(leads.source, ["valuation", "listing_request"]),
      ),
    )
    .orderBy(leads.createdAt);
  // A typical home for each request: one of the seeded listings' location, type and beds.
  const homes = (
    await db.execute<{
      location_id: string;
      property_type_id: string;
      beds: number;
      size: string;
      price: string;
    }>(sql`
      select location_id, property_type_id, beds, size, price from properties
      where agency_id = ${currentAgencyId()} and purpose = 'sale' and status = 'available'
        and beds is not null and size > 0 and price > 0
      order by reference`)
  ).rows;
  const counts = { valuations: 0, listings: 0 };
  for (const [i, lead] of owners.entries()) {
    const home = homes[(i * 5) % Math.max(1, homes.length)];
    if (!home) break;
    const size = Math.round(Number(home.size) * 0.97 * 100) / 100;
    const purpose = lead.type === "landlord" ? ("rent" as const) : ("sell" as const);
    const base = {
      contactId: lead.contactId,
      leadId: lead.id,
      purpose,
      propertyTypeId: home.property_type_id,
      locationId: home.location_id,
      building: null,
      beds: home.beds,
      baths: Math.max(1, home.beds),
      size,
      condition: i % 2 ? "excellent" : "good",
      upgrades: i % 2 ? ["kitchen", "flooring"] : [],
      notes: i % 2 ? "Vacant, keys with the building manager." : null,
      currency: market.baseCurrency.code,
      createdAt: lead.createdAt,
    };
    if (lead.source === "valuation") {
      const area = await locationAndBelow(db, home.location_id);
      const estimate = estimateValuation(
        {
          purpose: purpose === "rent" ? "rent" : "sale",
          propertyTypeId: home.property_type_id,
          areaLocationIds: area,
          beds: home.beds,
          size,
        },
        await loadComparableCandidates(db, {
          purpose: purpose === "rent" ? "rent" : "sale",
          propertyTypeId: home.property_type_id,
          locationIds: area,
          currency: market.baseCurrency.code,
          rentPeriod: market.rentPeriod,
        }),
        { decimals: market.baseCurrency.decimals },
      );
      await db.insert(valuationRequests).values({
        ...base,
        aiRangeMin: estimate.status === "estimate" ? estimate.low : null,
        aiRangeMax: estimate.status === "estimate" ? estimate.high : null,
        aiComparableIds: estimate.comparables.map((c) => c.id),
      });
      counts.valuations += 1;
    } else {
      await db.insert(listingRequests).values({
        ...base,
        askingPrice: Math.round(Number(home.price) * 0.95),
        availableFrom: localDateString(new Date(lead.createdAt.getTime() + 30 * 86_400_000), "UTC"),
      });
      counts.listings += 1;
    }
  }
  return counts;
}

/**
 * Price trends for the demo areas (16 §1 "12 months of area_price_stats"): 12 months of
 * admin-entered figures (note "Sample data for demo") ending four months ago, drawn around
 * each area's seeded listings with a gentle rise, then the agency's own figures computed by
 * the real monthly job for the last three months.
 */
export async function seedPriceStats(
  db: Db,
  options: { now: Date },
): Promise<{ entered: number; computed: number }> {
  const r = rng(20261024);
  const [market, general] = [await loadSettings("market", db), await loadSettings("general", db)];
  const agency = currentAgencyId();
  const medians = (
    await db.execute<{ location_id: string; purpose: "sale" | "rent"; median: string }>(sql`
      select location_id, purpose, percentile_cont(0.5) within group (order by
        (case when purpose = 'rent' and coalesce(price_period, ${market.rentPeriod}) = 'month'
          then price * 12 else price end)::numeric / size) as median
      from properties
      where agency_id = ${agency} and deleted_at is null and size > 0 and price > 0
        and currency = ${market.baseCurrency.code} and completion = 'ready'
      group by location_id, purpose`)
  ).rows;
  const thisMonth = monthOf(localDateString(options.now, general.timeZone));
  const lastAgencyMonth = previousMonth(thisMonth);
  const firstAgencyMonth = previousMonth(previousMonth(lastAgencyMonth));
  let period = previousMonth(firstAgencyMonth);
  const months: string[] = [];
  for (let i = 0; i < 12; i++, period = previousMonth(period)) months.unshift(period);

  const rows: Array<typeof areaPriceStats.$inferInsert> = [];
  for (const m of medians) {
    const median = Number(m.median);
    if (!(median > 0)) continue;
    months.forEach((p, i) => {
      // About 6% a year up to today's level, with a little month-to-month noise.
      const trend = 1 - 0.005 * (months.length + 3 - i);
      const noise = 1 + (r.next() - 0.5) * 0.02;
      rows.push({
        locationId: m.location_id,
        period: p,
        purpose: m.purpose,
        propertyTypeId: null,
        medianPricePerArea: Math.round(median * trend * noise),
        currency: market.baseCurrency.code,
        listingsCount: 8 + Math.round(r.next() * 20),
        source: "admin_entered",
        sourceNote: DEMO_PRICE_NOTE,
      });
    });
  }
  if (rows.length) await db.insert(areaPriceStats).values(rows);
  let computed = 0;
  for (let p = firstAgencyMonth; p <= lastAgencyMonth; p = monthOf(nextMonth(p)))
    computed += (await computeAgencyPriceStats(db, p)).rows;
  return { entered: rows.length, computed };
}

function nextMonth(period: string): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}
