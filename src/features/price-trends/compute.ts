import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { areaPriceStats } from "@/db/schema/stats";
import { loadSettings } from "@/features/settings/queries";
import { tags } from "@/lib/cache-tags";
import { expireTags } from "@/lib/expire-tags";
import { localDateString } from "@/lib/local-date";
import { newId } from "@/lib/ids";

/**
 * Agency data for price trends (11 §7), one month at a time, written by the monthly job.
 *
 * Data points for month M (all in the base currency, with a size; rents made yearly):
 * - Closed deals: listings marked sold (for sale) or rented (to rent) that closed in M, at
 *   their final price. The close date is when a won lead for the listing was won, else when
 *   the status changed to sold or rented (audit log), else the listing's last update. The
 *   final price is that won lead's deal value when it has one in the listing's currency, else
 *   the listing's price.
 * - The market at the end of M: listings live then (published before the month ended and
 *   still live, or closed later), at their asking price on the last day of M (price history).
 * Each figure is the median price per m² of those points, for a location with everything
 * inside it, per purpose, for all types and per type; only with at least 3 points. It also
 * keeps how many listings were on the market, how many deals closed and their average days on
 * the market. Re-running a month replaces its agency figures (idempotent); admin-entered
 * figures are never touched.
 */

export const MIN_POINTS = 3;

/** "2026-10-01" -> "2026-09-01". */
export function previousMonth(period: string): string {
  const [y, m] = period.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 10);
}

export const monthOf = (date: string): string => `${date.slice(0, 7)}-01`;

type Row = {
  location_id: string;
  purpose: "sale" | "rent";
  property_type_id: string | null;
  median: string | number;
  listings: number;
  deals: number;
  avg_days: string | number | null;
};

export async function computeAgencyPriceStats(
  db: DbOrTx,
  period: string,
): Promise<{ period: string; rows: number }> {
  const agency = currentAgencyId();
  const [market, general] = [await loadSettings("market", db), await loadSettings("general", db)];
  const start = monthOf(period);
  const [y, m] = start.split("-").map(Number) as [number, number];
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const tz = general.timeZone;
  const from = sql`(${start}::date)::timestamp at time zone ${tz}`;
  const to = sql`(${next}::date)::timestamp at time zone ${tz}`;
  const res = await db.execute<Row>(sql`
    with recursive closure as (
      select id as ancestor, id as descendant from locations where agency_id = ${agency}
      union all
      select c.ancestor, l.id from closure c join locations l on l.parent_id = c.descendant
    ), base as (
      select p.id, p.location_id, p.property_type_id, p.purpose, p.status, p.size,
        p.published_at, p.updated_at, p.price, p.price_period, p.currency,
        (select max(l.won_at) from leads l
          where l.agency_id = ${agency} and l.status = 'won' and p.id = any(l.property_ids)) as won_at,
        (select l.deal_value from leads l
          where l.agency_id = ${agency} and l.status = 'won' and p.id = any(l.property_ids)
            and l.deal_value > 0 and coalesce(l.deal_currency, p.currency) = p.currency
          order by l.won_at desc nulls last limit 1) as deal_value,
        (select max(a.created_at) from audit_log a
          where a.entity_type = 'property' and a.entity_id = p.id::text
            and a.action = 'property.status' and a.after->>'status' in ('sold', 'rented')) as status_at
      from properties p
      where p.agency_id = ${agency} and p.deleted_at is null and p.published_at is not null
        and p.location_id is not null and p.size > 0 and not p.price_on_request
        and p.currency = ${market.baseCurrency.code}
    ), dated as (
      select b.*, case when b.status in ('sold', 'rented')
        then coalesce(b.won_at, b.status_at, b.updated_at) end as closed_at
      from base b
    ), points as (
      select d.id, d.location_id, d.property_type_id, d.purpose, d.size, d.price_period,
        true as deal, coalesce(d.deal_value, d.price) as amount,
        extract(epoch from d.closed_at - d.published_at) / 86400 as days
      from dated d
      where d.closed_at >= ${from} and d.closed_at < ${to}
        and ((d.purpose = 'sale' and d.status = 'sold') or (d.purpose = 'rent' and d.status = 'rented'))
      union all
      select d.id, d.location_id, d.property_type_id, d.purpose, d.size, d.price_period,
        false, coalesce(
          (select h.new_price from price_history h
            where h.property_id = d.id and h.changed_at < ${to} order by h.changed_at desc limit 1),
          (select h.old_price from price_history h
            where h.property_id = d.id and h.changed_at >= ${to} order by h.changed_at asc limit 1),
          d.price),
        null
      from dated d
      where d.published_at < ${to}
        and (d.status in ('available', 'reserved', 'under_offer')
          or (d.closed_at is not null and d.closed_at >= ${to}))
    ), priced as (
      select p.*, (case when p.purpose = 'rent'
          and coalesce(p.price_period, ${market.rentPeriod}) = 'month'
        then p.amount * 12 else p.amount end)::numeric / p.size as per_sqm
      from points p where p.amount > 0
    ), placed as (
      select c.ancestor as location_id, x.purpose, x.property_type_id, x.per_sqm, x.deal, x.days
      from priced x
      join closure c on c.descendant = x.location_id
    )
    select location_id, purpose, null::uuid as property_type_id,
      percentile_cont(0.5) within group (order by per_sqm) as median,
      (count(*) filter (where not deal))::int as listings,
      (count(*) filter (where deal))::int as deals,
      avg(days) filter (where deal) as avg_days
    from placed group by location_id, purpose having count(*) >= ${MIN_POINTS}
    union all
    select location_id, purpose, property_type_id,
      percentile_cont(0.5) within group (order by per_sqm),
      (count(*) filter (where not deal))::int,
      (count(*) filter (where deal))::int,
      avg(days) filter (where deal)
    from placed where property_type_id is not null
    group by location_id, purpose, property_type_id having count(*) >= ${MIN_POINTS}`);

  const rows = res.rows.map((r) => ({
    id: newId(),
    agencyId: agency,
    locationId: r.location_id,
    period: start,
    purpose: r.purpose,
    propertyTypeId: r.property_type_id,
    medianPricePerArea: Math.round(Number(r.median)),
    currency: market.baseCurrency.code,
    listingsCount: Number(r.listings),
    dealsCount: Number(r.deals),
    avgDaysOnMarket: r.avg_days == null ? null : Math.round(Number(r.avg_days)),
    source: "agency_data" as const,
    sourceNote: null,
  }));
  const write = async (tx: DbOrTx) => {
    await tx
      .delete(areaPriceStats)
      .where(
        and(
          eq(areaPriceStats.agencyId, agency),
          eq(areaPriceStats.period, start),
          eq(areaPriceStats.source, "agency_data"),
        ),
      );
    for (let i = 0; i < rows.length; i += 200)
      await tx.insert(areaPriceStats).values(rows.slice(i, i + 200));
  };
  await db.transaction(write);
  return { period: start, rows: rows.length };
}

/** The monthly job (13 §2, on the 1st): last month, in the agency's time zone. */
export async function computeLastMonthPriceStats(db: DbOrTx, now = new Date()) {
  const general = await loadSettings("general", db);
  const result = await computeAgencyPriceStats(
    db,
    previousMonth(monthOf(localDateString(now, general.timeZone))),
  );
  expireTags(tags.priceStats);
  return result;
}
