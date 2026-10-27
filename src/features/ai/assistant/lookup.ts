import "server-only";
import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { visitors } from "@/db/schema/crm";
import { locations, propertyTypes } from "@/db/schema/master-data";
import { projects } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import type { ListingCardData } from "@/features/listings/cards";
import { currencyFormats, priceLabel } from "@/features/properties/format";
import { liveStatuses } from "@/features/properties/status";
import type { SettingsOf } from "@/features/settings/schema";
import { siteUrl } from "@/features/site/url";
import { formatMoney } from "@/lib/money";
import { formatArea } from "@/lib/units";

/**
 * Lookups the customer assistant's tools share: names the visitor types (areas, types,
 * references) to ids, and listings in the compact shape the model reads. Everything here is
 * public data; unit numbers, owners and internal notes never leave the database.
 */

const like = (text: string) => `%${text.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

/** Location ids and slugs for names or slugs ("Dubai Marina", "dubai-marina"); best match each. */
export async function findLocations(
  db: DbOrTx,
  names: string[],
): Promise<Array<{ id: string; slug: string; name: string }>> {
  const found: Array<{ id: string; slug: string; name: string }> = [];
  for (const raw of names
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 8)) {
    const [row] = await db
      .select({ id: locations.id, slug: locations.slug, name: locations.name })
      .from(locations)
      .where(
        and(
          eq(locations.agencyId, currentAgencyId()),
          or(eq(locations.slug, raw.toLowerCase()), ilike(locations.name, like(raw))),
        ),
      )
      // Exact names first, then the shortest (the area rather than a building in it).
      .orderBy(
        sql`(lower(${locations.slug}) = lower(${raw}) or lower(${locations.name}) = lower(${raw})) desc`,
        sql`length(${locations.name})`,
      )
      .limit(1);
    if (row && !found.some((f) => f.id === row.id)) found.push(row);
  }
  return found;
}

/** Property type slugs for names ("villa", "Apartments"). */
export async function findTypeSlugs(db: DbOrTx, names: string[]): Promise<string[]> {
  const terms = names
    .map((n) => n.trim().replace(/s$/i, ""))
    .filter(Boolean)
    .slice(0, 6);
  if (!terms.length) return [];
  const rows = await db
    .select({ slug: propertyTypes.slug })
    .from(propertyTypes)
    .where(
      and(
        eq(propertyTypes.agencyId, currentAgencyId()),
        or(
          ...terms.map((t) =>
            or(ilike(propertyTypes.name, like(t)), ilike(propertyTypes.slug, like(t))),
          ),
        ),
      ),
    );
  return [...new Set(rows.map((r) => r.slug))];
}

/** A live listing by its reference (any case), or null. */
export async function liveListingByReference(db: DbOrTx, reference: string) {
  const [row] = await db
    .select({
      id: properties.id,
      slug: properties.slug,
      reference: properties.reference,
      agentId: properties.agentId,
    })
    .from(properties)
    .where(
      and(
        eq(properties.agencyId, currentAgencyId()),
        sql`lower(${properties.reference}) = lower(${reference.trim()})`,
        inArray(properties.status, [...liveStatuses]),
        isNull(properties.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Live listing ids for references, in the order given (unknown ones are left out). */
export async function liveListingIds(db: DbOrTx, references: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const ref of references.slice(0, 6)) {
    const row = await liveListingByReference(db, ref);
    if (row && !ids.includes(row.id)) ids.push(row.id);
  }
  return ids;
}

/** A published project by slug or name. */
export async function publishedProject(db: DbOrTx, nameOrSlug: string) {
  const raw = nameOrSlug.trim();
  const [row] = await db
    .select({ id: projects.id, slug: projects.slug, name: projects.name })
    .from(projects)
    .where(
      and(
        eq(projects.agencyId, currentAgencyId()),
        eq(projects.isPublished, true),
        or(eq(projects.slug, raw.toLowerCase()), ilike(projects.name, like(raw))),
      ),
    )
    .orderBy(sql`length(${projects.name})`)
    .limit(1);
  return row ?? null;
}

/** The cookie value of a visitor row (leads copy the visitor's touches by it). */
export async function visitorKeyOf(db: DbOrTx, visitorId: string | null): Promise<string | null> {
  if (!visitorId) return null;
  const [row] = await db
    .select({ key: visitors.visitorKey })
    .from(visitors)
    .where(eq(visitors.id, visitorId));
  return row?.key ?? null;
}

export type MarketFormats = {
  money: (minor: number, currency?: string | null) => string;
  price: (p: Parameters<typeof priceLabel>[0]) => string;
  area: (sqm: number) => string;
  baseCurrency: string;
  decimals: number;
};

export function marketFormats(market: SettingsOf<"market">): MarketFormats {
  const formats = currencyFormats(market);
  const base = market.baseCurrency;
  return {
    money: (minor, currency) => formatMoney(minor, formats[currency ?? base.code] ?? base),
    price: (p) => priceLabel(p, formats),
    area: (sqm) => formatArea(sqm, market.areaUnit),
    baseCurrency: base.code,
    decimals: base.decimals,
  };
}

/** What the model reads about a listing in a list: facts with their units, and its link. */
export function listingFacts(card: ListingCardData, f: MarketFormats) {
  return {
    reference: card.reference,
    title: card.title,
    url: siteUrl(`/property/${card.slug}`),
    purpose: card.purpose === "sale" ? "for sale" : "for rent",
    status: card.status.replace(/_/g, " "),
    price: f.price(card),
    type: card.typeName,
    area: card.locationName,
    beds: card.beds === null ? null : card.beds === 0 ? "studio" : card.beds,
    baths: card.baths,
    size: card.size ? f.area(card.size) : null,
    completion: card.completion === "off_plan" ? "off-plan" : "ready",
    handover: card.handover,
    project: card.projectName,
  };
}
