import { and, asc, desc, eq, ilike, isNull, sql, type SQL } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { developers } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { mediaUrl } from "@/features/media/queries";
import type { TableParams } from "@/lib/table-params";
import type { DeveloperInput } from "./schema";
import { developerUsage } from "./usage";

export const developerSortable = ["name", "year", "updated"] as const;
export type DeveloperSort = (typeof developerSortable)[number];

export type DeveloperRow = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  establishedYear: number | null;
  noindex: boolean;
  logoUrl: string | null;
  updatedAt: string;
  usage: { total: number; parts: Array<{ label: string; count: number }> };
  data: DeveloperInput;
};

export async function listDevelopers(
  params: TableParams<DeveloperSort>,
  db?: DbOrTx,
): Promise<{ rows: DeveloperRow[]; total: number }> {
  const conn = db ?? (await getDb());
  const where: SQL[] = [eq(developers.agencyId, currentAgencyId()), isNull(developers.deletedAt)];
  if (params.q) {
    const like = `%${params.q.replace(/[\\%_]/g, "\\$&")}%`;
    // Typo-tolerant: plain substring, or trigram similarity on the accent-free name.
    where.push(
      sql`(${ilike(developers.name, like)} or lintel_normalize(${developers.name}) % lintel_normalize(${params.q}))`,
    );
  }
  const order =
    params.sort.id === "year"
      ? [
          params.sort.desc
            ? sql`${developers.establishedYear} desc nulls last`
            : sql`${developers.establishedYear} asc nulls last`,
          asc(developers.name),
        ]
      : params.sort.id === "updated"
        ? [params.sort.desc ? desc(developers.updatedAt) : asc(developers.updatedAt)]
        : [params.sort.desc ? desc(developers.name) : asc(developers.name)];

  const rows = await conn
    .select({
      developer: developers,
      logoKey: media.r2Key,
      logoStatus: media.status,
    })
    .from(developers)
    .leftJoin(media, eq(media.id, developers.logoId))
    .where(and(...where))
    .orderBy(...order)
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);
  const [count] = await conn
    .select({ n: sql<number>`count(*)::int` })
    .from(developers)
    .where(and(...where));
  const usage = await developerUsage(
    conn,
    rows.map((r) => r.developer.id),
  );

  return {
    total: count?.n ?? 0,
    rows: rows.map(({ developer: d, logoKey, logoStatus }) => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
      website: d.website,
      establishedYear: d.establishedYear,
      noindex: d.noindex,
      logoUrl: logoKey && logoStatus === "ready" ? mediaUrl(logoKey) : null,
      updatedAt: d.updatedAt.toISOString(),
      usage: usage.get(d.id) ?? { total: 0, parts: [] },
      data: {
        name: d.name,
        slug: d.slug,
        logoId: d.logoId,
        description: d.description,
        website: d.website,
        establishedYear: d.establishedYear,
        seoTitle: d.seoTitle,
        seoDescription: d.seoDescription,
        canonicalUrl: d.canonicalUrl,
        noindex: d.noindex,
        ogImageId: d.ogImageId,
      },
    })),
  };
}

export async function getDeveloperForAdmin(id: string, db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const [row] = await conn
    .select()
    .from(developers)
    .where(
      and(
        eq(developers.id, id),
        eq(developers.agencyId, currentAgencyId()),
        isNull(developers.deletedAt),
      ),
    );
  return row ?? null;
}

/** Name + id of every developer, for "merge into…" and (later) project forms. */
export async function developerOptions(db?: DbOrTx) {
  const conn = db ?? (await getDb());
  return conn
    .select({ id: developers.id, name: developers.name })
    .from(developers)
    .where(and(eq(developers.agencyId, currentAgencyId()), isNull(developers.deletedAt)))
    .orderBy(asc(developers.name));
}
