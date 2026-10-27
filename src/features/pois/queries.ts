import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { poiTypes, pois } from "@/db/schema/master-data";
import type { TableParams } from "@/lib/table-params";

export const poiSortable = ["name", "type", "updated"] as const;
export type PoiSort = (typeof poiSortable)[number];

export type PoiRow = {
  id: string;
  name: string;
  address: string | null;
  point: { lng: number; lat: number };
  poiTypeId: string;
  typeName: string;
  typeIcon: string | null;
  googlePlaceId: string | null;
  website: string | null;
  ratingNote: string | null;
  isActive: boolean;
  updatedAt: Date;
};

export async function listPois(
  params: TableParams<PoiSort>,
  db?: DbOrTx,
): Promise<{ rows: PoiRow[]; total: number }> {
  const conn = db ?? (await getDb());
  const where: SQL[] = [eq(pois.agencyId, currentAgencyId())];
  if (params.q) {
    const like = `%${params.q.replace(/[%_]/g, "\\$&")}%`;
    where.push(or(ilike(pois.name, like), ilike(pois.address, like))!);
  }
  const type = params.get("type");
  if (type) where.push(eq(pois.poiTypeId, type));
  const active = params.get("active");
  if (active === "yes") where.push(eq(pois.isActive, true));
  if (active === "no") where.push(eq(pois.isActive, false));

  const order =
    params.sort.id === "type"
      ? [params.sort.desc ? desc(poiTypes.name) : asc(poiTypes.name), asc(pois.name)]
      : params.sort.id === "updated"
        ? [params.sort.desc ? desc(pois.updatedAt) : asc(pois.updatedAt)]
        : [params.sort.desc ? desc(pois.name) : asc(pois.name)];

  const [rows, [count]] = await Promise.all([
    conn
      .select({
        id: pois.id,
        name: pois.name,
        address: pois.address,
        point: pois.point,
        poiTypeId: pois.poiTypeId,
        typeName: poiTypes.name,
        typeIcon: poiTypes.icon,
        googlePlaceId: pois.googlePlaceId,
        website: pois.website,
        ratingNote: pois.ratingNote,
        isActive: pois.isActive,
        updatedAt: pois.updatedAt,
      })
      .from(pois)
      .innerJoin(poiTypes, eq(poiTypes.id, pois.poiTypeId))
      .where(and(...where))
      .orderBy(...order)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    conn
      .select({ n: sql<number>`count(*)::int` })
      .from(pois)
      .where(and(...where)),
  ]);
  return { rows, total: count?.n ?? 0 };
}
