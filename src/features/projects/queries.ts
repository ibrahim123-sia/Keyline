import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { developers, locations } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import {
  projectMedia,
  projectStatuses,
  projectUnitTypes,
  projects,
  type ProjectStatus,
} from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import { mediaUrl } from "@/features/media/queries";
import { locationAndBelow } from "@/features/properties/queries";
import type { TableParams } from "@/lib/table-params";

export const projectSortable = ["updated", "name", "handover", "progress"] as const;
export type ProjectSort = (typeof projectSortable)[number];

export type ProjectRow = {
  id: string;
  name: string;
  slug: string;
  developerName: string | null;
  locationName: string | null;
  status: ProjectStatus;
  handoverDate: string | null;
  handoverText: string | null;
  constructionProgress: number | null;
  unitsAvailable: number | null;
  unitTypes: number;
  listings: number;
  isPublished: boolean;
  coverUrl: string | null;
  updatedAt: string;
};

const uuid = /^[0-9a-f-]{36}$/i;

export function projectFilters(params: Pick<TableParams<string>, "q" | "get">): SQL[] {
  const where: SQL[] = [eq(projects.agencyId, currentAgencyId()), isNull(projects.deletedAt)];
  const status = params.get("status");
  if (status && (projectStatuses as readonly string[]).includes(status))
    where.push(eq(projects.status, status as ProjectStatus));
  const developer = params.get("developer");
  if (developer && uuid.test(developer)) where.push(eq(projects.developerId, developer));
  const area = params.get("area");
  if (area && uuid.test(area)) where.push(sql`${projects.locationId} in ${locationAndBelow(area)}`);
  const published = params.get("published");
  if (published === "1") where.push(eq(projects.isPublished, true));
  if (published === "0") where.push(eq(projects.isPublished, false));
  if (params.q) {
    const like = `%${params.q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push(
      or(
        ilike(projects.name, like),
        sql`lintel_normalize(${projects.name}) % lintel_normalize(${params.q})`,
      )!,
    );
  }
  return where;
}

export async function listProjects(
  params: TableParams<ProjectSort>,
  db?: DbOrTx,
): Promise<{ rows: ProjectRow[]; total: number }> {
  const conn = db ?? (await getDb());
  const where = and(...projectFilters(params));
  const available = sql<
    number | null
  >`(select sum(${projectUnitTypes.availableCount})::int from ${projectUnitTypes} where ${projectUnitTypes.projectId} = ${projects.id})`;
  const unitTypes = sql<number>`(select count(*)::int from ${projectUnitTypes} where ${projectUnitTypes.projectId} = ${projects.id})`;
  const listings = sql<number>`(select count(*)::int from ${properties} where ${properties.projectId} = ${projects.id} and ${properties.deletedAt} is null)`;
  const cover = sql<
    string | null
  >`(select m.r2_key from ${projectMedia} pm join ${media} m on m.id = pm.media_id
      where pm.project_id = ${projects.id} and pm.kind = 'photo' and m.status = 'ready'
      order by pm.is_cover desc, pm.sort_order asc limit 1)`;
  const order: SQL[] = (() => {
    const d = params.sort.desc;
    switch (params.sort.id) {
      case "name":
        return [d ? desc(projects.name) : asc(projects.name)];
      case "handover":
        return [
          d
            ? sql`${projects.handoverDate} desc nulls last`
            : sql`${projects.handoverDate} asc nulls last`,
        ];
      case "progress":
        return [
          d
            ? sql`${projects.constructionProgress} desc nulls last`
            : sql`${projects.constructionProgress} asc nulls last`,
        ];
      default:
        return [d ? desc(projects.updatedAt) : asc(projects.updatedAt)];
    }
  })();
  const rows = await conn
    .select({
      p: {
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
        status: projects.status,
        handoverDate: projects.handoverDate,
        handoverText: projects.handoverText,
        constructionProgress: projects.constructionProgress,
        isPublished: projects.isPublished,
        updatedAt: projects.updatedAt,
      },
      developerName: developers.name,
      locationName: locations.name,
      available,
      unitTypes,
      listings,
      cover,
    })
    .from(projects)
    .leftJoin(developers, eq(developers.id, projects.developerId))
    .leftJoin(locations, eq(locations.id, projects.locationId))
    .where(where)
    .orderBy(...order, desc(projects.id))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);
  const [total] = await conn
    .select({ n: sql<number>`count(*)::int` })
    .from(projects)
    .where(where);
  return {
    total: total?.n ?? 0,
    rows: rows.map(
      ({ p, developerName, locationName, available: a, unitTypes: u, listings: l, cover: c }) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        developerName,
        locationName,
        status: p.status,
        handoverDate: p.handoverDate,
        handoverText: p.handoverText,
        constructionProgress: p.constructionProgress,
        unitsAvailable: a == null ? null : Number(a),
        unitTypes: Number(u),
        listings: Number(l),
        isPublished: p.isPublished,
        coverUrl: c ? mediaUrl(c) : null,
        updatedAt: p.updatedAt.toISOString(),
      }),
    ),
  };
}

/** Filter options for the list toolbar and the "New project" dialog. */
export async function projectFilterOptions(db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const agency = currentAgencyId();
  const developerRows = await conn
    .select({ id: developers.id, name: developers.name })
    .from(developers)
    .where(and(eq(developers.agencyId, agency), isNull(developers.deletedAt)))
    .orderBy(asc(developers.name));
  const nodes = await conn
    .select({
      id: locations.id,
      parentId: locations.parentId,
      name: locations.name,
      level: locations.level,
    })
    .from(locations)
    .where(eq(locations.agencyId, agency))
    .orderBy(asc(locations.name));
  return { developers: developerRows, locations: nodes };
}
