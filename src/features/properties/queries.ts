import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { locations, propertyTypes } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { agents } from "@/db/schema/people";
import {
  properties,
  propertyCompletions,
  propertyDailyStats,
  propertyMedia,
  propertyPurposes,
  propertyStatuses,
  type PropertyStatus,
} from "@/db/schema/properties";
import { mediaUrl } from "@/features/media/queries";
import type { TableParams } from "@/lib/table-params";

export const propertySortable = [
  "updated",
  "price",
  "reference",
  "title",
  "views",
  "inquiries",
] as const;
export type PropertySort = (typeof propertySortable)[number];

export type PropertyRow = {
  id: string;
  reference: string;
  title: string;
  slug: string;
  purpose: (typeof propertyPurposes)[number];
  status: PropertyStatus;
  completion: (typeof propertyCompletions)[number];
  price: number | null;
  currency: string | null;
  priceOnRequest: boolean;
  pricePeriod: "year" | "month" | null;
  typeName: string | null;
  locationName: string | null;
  beds: number | null;
  agentName: string | null;
  isFeatured: boolean;
  isVerified: boolean;
  lastVerifiedAt: string | null;
  /** Whole days since the last verification (null when never verified). */
  verifiedDays: number | null;
  views30: number;
  inquiries30: number;
  coverUrl: string | null;
  updatedAt: string;
  archived: boolean;
};

const oneOf = <T extends string>(values: readonly T[], v: string | undefined): T | undefined =>
  values.includes(v as T) ? (v as T) : undefined;

/** The location and everything under it (an "area" filter includes its communities). */
export function locationAndBelow(id: string): SQL {
  return sql`(with recursive sub as (
      select ${locations.id} as id from ${locations} where ${locations.id} = ${id}::uuid
      union all
      select l.id from locations l join sub on l.parent_id = sub.id
    ) select id from sub)`;
}

/** Filters from the URL (07 §2); unknown values are ignored. */
export function propertyFilters(params: Pick<TableParams<string>, "q" | "get">): SQL[] {
  const where: SQL[] = [eq(properties.agencyId, currentAgencyId())];
  where.push(
    params.get("archived") === "1" ? isNotNull(properties.deletedAt) : isNull(properties.deletedAt),
  );
  const purpose = oneOf(propertyPurposes, params.get("purpose"));
  if (purpose) where.push(eq(properties.purpose, purpose));
  const status = oneOf(propertyStatuses, params.get("status"));
  if (status) where.push(eq(properties.status, status));
  const completion = oneOf(propertyCompletions, params.get("completion"));
  if (completion) where.push(eq(properties.completion, completion));
  const uuid = /^[0-9a-f-]{36}$/i;
  const type = params.get("type");
  if (type && uuid.test(type)) where.push(eq(properties.propertyTypeId, type));
  const area = params.get("area");
  if (area && uuid.test(area))
    where.push(sql`${properties.locationId} in ${locationAndBelow(area)}`);
  const agent = params.get("agent");
  if (agent === "none") where.push(isNull(properties.agentId));
  else if (agent && uuid.test(agent)) where.push(eq(properties.agentId, agent));
  const days = Number(params.get("verifiedOlder"));
  if (Number.isInteger(days) && days > 0) {
    where.push(
      or(
        eq(properties.isVerified, false),
        isNull(properties.lastVerifiedAt),
        lt(properties.lastVerifiedAt, sql`now() - make_interval(days => ${days})`),
      )!,
    );
  }
  if (params.get("noPhotos") === "1") {
    where.push(
      sql`not exists (select 1 from ${propertyMedia} where ${propertyMedia.propertyId} = ${properties.id} and ${propertyMedia.kind} = 'photo')`,
    );
  }
  if (params.get("missingSeo") === "1")
    where.push(
      or(
        isNull(properties.seoTitle),
        eq(properties.seoTitle, ""),
        isNull(properties.seoDescription),
        eq(properties.seoDescription, ""),
      )!,
    );
  if (params.get("featured") === "1") where.push(eq(properties.isFeatured, true));
  if (params.q) {
    const like = `%${params.q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push(
      or(
        ilike(properties.reference, like),
        ilike(properties.title, like),
        ilike(properties.buildingName, like),
        sql`${properties.searchVector} @@ plainto_tsquery('simple', lintel_normalize(${params.q}))`,
        sql`lintel_normalize(${properties.title}) % lintel_normalize(${params.q})`,
      )!,
    );
  }
  return where;
}

const statsSince = sql`(current_date - 30)`;

export async function listProperties(
  params: TableParams<PropertySort>,
  db?: DbOrTx,
): Promise<{ rows: PropertyRow[]; total: number }> {
  const conn = db ?? (await getDb());
  const where = and(...propertyFilters(params));
  const views30 = sql<number>`coalesce((select sum(${propertyDailyStats.views}) from ${propertyDailyStats} where ${propertyDailyStats.propertyId} = ${properties.id} and ${propertyDailyStats.date} >= ${statsSince}), 0)::int`;
  const inquiries30 = sql<number>`coalesce((select sum(${propertyDailyStats.inquiries}) from ${propertyDailyStats} where ${propertyDailyStats.propertyId} = ${properties.id} and ${propertyDailyStats.date} >= ${statsSince}), 0)::int`;
  const cover = sql<
    string | null
  >`(select m.r2_key from ${propertyMedia} pm join ${media} m on m.id = pm.media_id
      where pm.property_id = ${properties.id} and pm.kind = 'photo' and m.status = 'ready'
      order by pm.is_cover desc, pm.sort_order asc limit 1)`;
  const dir = (c: SQL | Parameters<typeof asc>[0]) => (params.sort.desc ? desc(c) : asc(c));
  const order: SQL[] = (() => {
    switch (params.sort.id) {
      case "price":
        return [
          params.sort.desc
            ? sql`${properties.price} desc nulls last`
            : sql`${properties.price} asc nulls last`,
        ];
      case "reference":
        return [dir(properties.reference)];
      case "title":
        return [dir(properties.title)];
      case "views":
        return [params.sort.desc ? sql`${views30} desc` : sql`${views30} asc`];
      case "inquiries":
        return [params.sort.desc ? sql`${inquiries30} desc` : sql`${inquiries30} asc`];
      default:
        return [dir(properties.updatedAt)];
    }
  })();

  const rows = await conn
    .select({
      p: {
        id: properties.id,
        reference: properties.reference,
        title: properties.title,
        slug: properties.slug,
        purpose: properties.purpose,
        status: properties.status,
        completion: properties.completion,
        price: properties.price,
        currency: properties.currency,
        priceOnRequest: properties.priceOnRequest,
        pricePeriod: properties.pricePeriod,
        beds: properties.beds,
        isFeatured: properties.isFeatured,
        isVerified: properties.isVerified,
        lastVerifiedAt: properties.lastVerifiedAt,
        updatedAt: properties.updatedAt,
        deletedAt: properties.deletedAt,
      },
      typeName: propertyTypes.name,
      locationName: locations.name,
      agentName: agents.name,
      views30,
      inquiries30,
      cover,
    })
    .from(properties)
    .leftJoin(propertyTypes, eq(propertyTypes.id, properties.propertyTypeId))
    .leftJoin(locations, eq(locations.id, properties.locationId))
    .leftJoin(agents, eq(agents.id, properties.agentId))
    .where(where)
    .orderBy(...order, desc(properties.id))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);
  const [total] = await conn
    .select({ n: sql<number>`count(*)::int` })
    .from(properties)
    .where(where);
  const now = Date.now();

  return {
    total: total?.n ?? 0,
    rows: rows.map(
      ({ p, typeName, locationName, agentName, views30: v, inquiries30: i, cover: c }) => ({
        id: p.id,
        reference: p.reference,
        title: p.title,
        slug: p.slug,
        purpose: p.purpose,
        status: p.status,
        completion: p.completion,
        price: p.price,
        currency: p.currency,
        priceOnRequest: p.priceOnRequest,
        pricePeriod: p.pricePeriod,
        typeName,
        locationName,
        beds: p.beds,
        agentName,
        isFeatured: p.isFeatured,
        isVerified: p.isVerified,
        lastVerifiedAt: p.lastVerifiedAt?.toISOString() ?? null,
        verifiedDays:
          p.isVerified && p.lastVerifiedAt
            ? Math.max(0, Math.floor((now - p.lastVerifiedAt.getTime()) / 86_400_000))
            : null,
        views30: Number(v),
        inquiries30: Number(i),
        coverUrl: c ? mediaUrl(c) : null,
        updatedAt: p.updatedAt.toISOString(),
        archived: p.deletedAt !== null,
      }),
    ),
  };
}

/** Ids matching the current filters (bulk actions on "all results", CSV export). */
export async function propertyIdsFor(params: Pick<TableParams<string>, "q" | "get">, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const rows = await conn
    .select({ id: properties.id })
    .from(properties)
    .where(and(...propertyFilters(params)))
    .limit(10_000);
  return rows.map((r) => r.id);
}

/** Filter options for the list toolbar. */
export async function propertyFilterOptions(db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const agency = currentAgencyId();
  const [types, areas, agentRows] = await Promise.all([
    conn
      .select({ id: propertyTypes.id, name: propertyTypes.name })
      .from(propertyTypes)
      .where(eq(propertyTypes.agencyId, agency))
      .orderBy(asc(propertyTypes.sortOrder), asc(propertyTypes.name)),
    conn
      .select({ id: locations.id, name: locations.name, level: locations.level })
      .from(locations)
      .where(
        and(
          eq(locations.agencyId, agency),
          inArray(locations.level, ["city", "area", "community"]),
        ),
      )
      .orderBy(asc(locations.name)),
    conn
      .select({ id: agents.id, name: agents.name, isActive: agents.isActive })
      .from(agents)
      .where(eq(agents.agencyId, agency))
      .orderBy(asc(agents.name)),
  ]);
  return { types, areas, agents: agentRows };
}
