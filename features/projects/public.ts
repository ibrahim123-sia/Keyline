import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { developers, facilities, locations, pois, type PoiCategory } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import {
  projectFacilities,
  projectMedia,
  projectStatuses,
  projectUnitTypes,
  projects,
  type ProjectStatus,
} from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import { loadListingCards, type ListingCardData } from "@/features/listings/cards";
import { getPublicMedia, mediaUrl, type PublicMedia } from "@/features/media/queries";
import {
  isPlanComplete,
  suggestSummaryLabel,
  type PlanStep,
} from "@/features/payment-plans/schema";
import { loadPlans } from "@/features/payment-plans/store";
import { listProjectPois } from "@/features/pois/nearby-queries";
import { searchableStatuses } from "@/features/properties/status";
import { tags } from "@/lib/cache-tags";
import type { LngLat } from "@/lib/geo";

/** Public project data (06 §6): published, not deleted, of this agency. */

export type ProjectPhoto = {
  url: string;
  alt: string;
  color: string | null;
  width: number | null;
  height: number | null;
};

export type ProjectCardData = {
  id: string;
  slug: string;
  name: string;
  status: ProjectStatus;
  developerName: string | null;
  locationName: string | null;
  /** "Q3 2027" text or an ISO date. */
  handover: string | null;
  startingPrice: number | null;
  currency: string;
  /** Short payment plan label ("60/40"), only for a complete plan. */
  planLabel: string | null;
  unitTypes: string | null;
  progress: number | null;
  cover: ProjectPhoto | null;
  isFeatured: boolean;
};

export type ProjectFilters = {
  /** Location slug: the area and everything inside it. */
  area: string | null;
  /** Developer slug. */
  developer: string | null;
  status: ProjectStatus | null;
  /** Handover by the end of this year. */
  handover: number | null;
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseProjectFilters(
  sp: Record<string, string | string[] | undefined>,
): ProjectFilters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || null;
  };
  const area = one("area");
  const developer = one("developer");
  const status = one("status");
  const year = Number(one("handover"));
  return {
    area: area && SLUG.test(area) ? area : null,
    developer: developer && SLUG.test(developer) ? developer : null,
    status: projectStatuses.includes(status as ProjectStatus) ? (status as ProjectStatus) : null,
    handover: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null,
  };
}

/** "Studio to 3 beds", "2 to 4 beds", "3 beds". */
export function bedsRange(beds: Array<number | null>): string | null {
  const known = [...new Set(beds.filter((b): b is number => b !== null))].sort((a, b) => a - b);
  if (known.length === 0) return null;
  const text = (b: number) => (b === 0 ? "Studio" : String(b));
  const lo = known[0]!;
  const hi = known.at(-1)!;
  if (lo === hi) return lo === 0 ? "Studios" : `${hi} ${hi === 1 ? "bed" : "beds"}`;
  return `${text(lo)} to ${hi} beds`;
}

const handoverYear = sql`coalesce(extract(year from ${projects.handoverDate})::int, substring(${projects.handoverText} from '(\\d{4})')::int)`;

function publicWhere(f?: ProjectFilters): SQL[] {
  const agency = currentAgencyId();
  const where: SQL[] = [
    eq(projects.agencyId, agency),
    eq(projects.isPublished, true),
    isNull(projects.deletedAt),
  ];
  if (f?.area)
    where.push(sql`${projects.locationId} in (
      with recursive sub as (
        select id from locations where agency_id = ${agency} and slug = ${f.area}
        union all
        select l.id from locations l join sub on l.parent_id = sub.id
      ) select id from sub)`);
  if (f?.developer)
    where.push(
      sql`${projects.developerId} = (select id from developers where agency_id = ${agency} and slug = ${f.developer} and deleted_at is null)`,
    );
  if (f?.status) where.push(eq(projects.status, f.status));
  if (f?.handover) where.push(sql`${handoverYear} <= ${f.handover}`);
  return where;
}

async function cards(db: DbOrTx, where: SQL[], limit: number): Promise<ProjectCardData[]> {
  const rows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      status: projects.status,
      developerName: developers.name,
      locationName: locations.name,
      handoverDate: projects.handoverDate,
      handoverText: projects.handoverText,
      startingPrice: projects.startingPrice,
      currency: projects.currency,
      unitTypesSummary: projects.unitTypesSummary,
      progress: projects.constructionProgress,
      paymentPlanId: projects.paymentPlanId,
      isFeatured: projects.isFeatured,
    })
    .from(projects)
    .leftJoin(developers, eq(developers.id, projects.developerId))
    .leftJoin(locations, eq(locations.id, projects.locationId))
    .where(and(...where))
    .orderBy(
      desc(projects.isFeatured),
      sql`${projects.publishedAt} desc nulls last`,
      asc(projects.name),
    )
    .limit(limit);
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const covers = await db
    .selectDistinctOn([projectMedia.projectId], {
      projectId: projectMedia.projectId,
      key: media.r2Key,
      alt: projectMedia.alt,
      libraryAlt: media.alt,
      color: media.dominantColor,
      width: media.width,
      height: media.height,
    })
    .from(projectMedia)
    .innerJoin(media, eq(media.id, projectMedia.mediaId))
    .where(
      and(
        inArray(projectMedia.projectId, ids),
        eq(projectMedia.kind, "photo"),
        eq(media.status, "ready"),
      ),
    )
    .orderBy(projectMedia.projectId, desc(projectMedia.isCover), asc(projectMedia.sortOrder));
  const units = await db
    .select({ projectId: projectUnitTypes.projectId, beds: projectUnitTypes.beds })
    .from(projectUnitTypes)
    .where(inArray(projectUnitTypes.projectId, ids));
  const plans = await loadPlans(
    db,
    rows.flatMap((r) => (r.paymentPlanId ? [r.paymentPlanId] : [])),
  );
  return rows.map((r) => {
    const cover = covers.find((c) => c.projectId === r.id);
    const plan = r.paymentPlanId ? plans.get(r.paymentPlanId) : undefined;
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      status: r.status,
      developerName: r.developerName,
      locationName: r.locationName,
      handover: r.handoverText || r.handoverDate,
      startingPrice: r.startingPrice,
      currency: r.currency ?? "",
      planLabel:
        plan && isPlanComplete(plan.steps)
          ? plan.summaryLabel || suggestSummaryLabel(plan.steps) || null
          : null,
      unitTypes:
        r.unitTypesSummary ||
        bedsRange(units.filter((u) => u.projectId === r.id).map((u) => u.beds)),
      progress: r.progress,
      cover: cover
        ? {
            url: mediaUrl(cover.key),
            alt: cover.alt || cover.libraryAlt || "",
            color: cover.color,
            width: cover.width,
            height: cover.height,
          }
        : null,
      isFeatured: r.isFeatured,
    };
  });
}

/** /projects (06 §6): published projects matching the filters, featured first. */
export async function listPublicProjects(f: ProjectFilters): Promise<ProjectCardData[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.projects, tags.developers, tags.locations);
  const db = await getDb();
  return cards(db, publicWhere(f), 200);
}

/** Cards for the home page's "Projects showcase" section (08 §1): featured, a pick, or an area. */
export async function showcaseProjectCards(props: {
  source: "featured" | "manual" | "area";
  projectIds: string[];
  locationId: string | null;
  count: number;
}): Promise<ProjectCardData[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.projects, tags.developers, tags.locations);
  const db = await getDb();
  const where = publicWhere();
  if (props.source === "manual") {
    if (props.projectIds.length === 0) return [];
    where.push(inArray(projects.id, props.projectIds));
  }
  if (props.source === "area" && props.locationId)
    where.push(sql`${projects.locationId} in (
      with recursive sub as (
        select id from locations where id = ${props.locationId}::uuid
        union all
        select l.id from locations l join sub on l.parent_id = sub.id
      ) select id from sub)`);
  return cards(db, where, props.count);
}

/** Choices for the /projects filters: only areas, developers and years that have projects. */
export async function publicProjectFilterOptions(): Promise<{
  areas: Array<{ slug: string; name: string }>;
  developers: Array<{ slug: string; name: string }>;
  years: number[];
}> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.projects, tags.developers, tags.locations);
  const db = await getDb();
  const where = and(...publicWhere());
  const areas = await db
    .selectDistinct({ slug: locations.slug, name: locations.name })
    .from(projects)
    .innerJoin(locations, eq(locations.id, projects.locationId))
    .where(where)
    .orderBy(asc(locations.name));
  const devs = await db
    .selectDistinct({ slug: developers.slug, name: developers.name })
    .from(projects)
    .innerJoin(developers, eq(developers.id, projects.developerId))
    .where(and(where, isNull(developers.deletedAt)))
    .orderBy(asc(developers.name));
  const years = await db
    .selectDistinct({ year: sql<number | null>`${handoverYear}` })
    .from(projects)
    .where(where);
  return {
    areas,
    developers: devs,
    years: years
      .map((y) => y.year)
      .filter((y): y is number => y !== null)
      .sort((a, b) => a - b),
  };
}

export type PublicProject = {
  id: string;
  slug: string;
  name: string;
  status: ProjectStatus;
  descriptionHtml: string | null;
  highlights: string[];
  launchDate: string | null;
  handover: string | null;
  progress: number | null;
  progressUpdatedAt: string | null;
  startingPrice: number | null;
  currency: string;
  totalUnits: number | null;
  unitTypesSummary: string | null;
  planLabel: string | null;
  developer: {
    name: string;
    slug: string;
    logo: PublicMedia | null;
    description: string | null;
    website: string | null;
  } | null;
  /** The location and the areas above it, outermost first. */
  locationPath: Array<{ name: string; slug: string }>;
  point: LngLat | null;
  photos: ProjectPhoto[];
  masterPlan: { url: string; alt: string; isPdf: boolean } | null;
  brochure: { url: string; fileName: string } | null;
  videoUrl: string | null;
  tourUrl: string | null;
  facilities: Array<{ name: string; icon: string | null }>;
  unitTypes: Array<{
    id: string;
    name: string;
    beds: number | null;
    baths: number | null;
    sizeMin: number | null;
    sizeMax: number | null;
    priceFrom: number | null;
    floorPlanUrl: string | null;
    availableCount: number | null;
  }>;
  plan: { steps: PlanStep[]; summaryLabel: string | null; notes: string | null } | null;
  nearby: Array<{
    id: string;
    name: string;
    typeName: string;
    category: PoiCategory;
    distanceM: number;
    seconds: number | null;
    mode: "drive" | "walk";
    overrideText: string | null;
    point: LngLat | null;
  }>;
  listings: ListingCardData[];
  similar: ProjectCardData[];
  seo: {
    title: string | null;
    description: string | null;
    canonicalUrl: string | null;
    noindex: boolean;
    ogImageId: string | null;
  };
};

/** /projects/[slug]: everything the page shows (cached; the editor expires project tags). */
export async function getPublicProject(slug: string): Promise<PublicProject | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.projects);
  const db = await getDb();
  const [p] = await db
    .select()
    .from(projects)
    .where(and(...publicWhere(), eq(projects.slug, slug)))
    .limit(1);
  if (!p) return null;
  cacheTag(tags.project(p.id), tags.listings, tags.developers);

  const [dev] = p.developerId
    ? await db
        .select()
        .from(developers)
        .where(and(eq(developers.id, p.developerId), isNull(developers.deletedAt)))
    : [];
  const path: Array<{ name: string; slug: string }> = [];
  if (p.locationId) {
    const res = await db.execute<{ name: string; slug: string; depth: number }>(sql`
      with recursive up as (
        select id, parent_id, name, slug, 0 as depth from locations where id = ${p.locationId}::uuid
        union all
        select l.id, l.parent_id, l.name, l.slug, up.depth + 1 from locations l join up on l.id = up.parent_id
      ) select name, slug, depth from up order by depth desc`);
    path.push(...res.rows.map((r) => ({ name: r.name, slug: r.slug })));
  }
  const mediaRows = await db
    .select({
      kind: projectMedia.kind,
      alt: projectMedia.alt,
      isCover: projectMedia.isCover,
      sortOrder: projectMedia.sortOrder,
      key: media.r2Key,
      libraryAlt: media.alt,
      color: media.dominantColor,
      width: media.width,
      height: media.height,
    })
    .from(projectMedia)
    .innerJoin(media, eq(media.id, projectMedia.mediaId))
    .where(and(eq(projectMedia.projectId, p.id), eq(media.status, "ready")))
    .orderBy(desc(projectMedia.isCover), asc(projectMedia.sortOrder));
  const fileRows = await db
    .select({
      id: media.id,
      key: media.r2Key,
      alt: media.alt,
      mime: media.mime,
      fileName: media.fileName,
    })
    .from(media)
    .where(
      and(
        inArray(
          media.id,
          [p.masterPlanId, p.brochureId].filter((x): x is string => Boolean(x)),
        ),
        eq(media.status, "ready"),
      ),
    );
  const file = (id: string | null) => (id ? fileRows.find((f) => f.id === id) : undefined);
  const masterPlan = file(p.masterPlanId);
  const brochure = file(p.brochureId);
  const facilityRows = await db
    .select({ name: facilities.name, icon: facilities.icon })
    .from(projectFacilities)
    .innerJoin(facilities, eq(facilities.id, projectFacilities.facilityId))
    .where(eq(projectFacilities.projectId, p.id))
    .orderBy(asc(facilities.sortOrder), asc(facilities.name));
  const unitRows = await db
    .select({
      id: projectUnitTypes.id,
      name: projectUnitTypes.name,
      beds: projectUnitTypes.beds,
      baths: projectUnitTypes.baths,
      sizeMin: projectUnitTypes.sizeMin,
      sizeMax: projectUnitTypes.sizeMax,
      priceFrom: projectUnitTypes.priceFrom,
      floorPlanKey: media.r2Key,
      availableCount: projectUnitTypes.availableCount,
    })
    .from(projectUnitTypes)
    .leftJoin(media, and(eq(media.id, projectUnitTypes.floorPlanId), eq(media.status, "ready")))
    .where(eq(projectUnitTypes.projectId, p.id))
    .orderBy(asc(projectUnitTypes.sortOrder), asc(projectUnitTypes.name));
  const planRecord = p.paymentPlanId
    ? (await loadPlans(db, [p.paymentPlanId])).get(p.paymentPlanId)
    : undefined;
  const plan = planRecord && isPlanComplete(planRecord.steps) ? planRecord : null;
  const nearby = (await listProjectPois(db, p.id)).rows.filter((r) => r.isShown);
  const poiPoints = nearby.length
    ? await db
        .select({ id: pois.id, point: pois.point })
        .from(pois)
        .where(
          inArray(
            pois.id,
            nearby.map((n) => n.poiId),
          ),
        )
    : [];
  const listingRows = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.projectId, p.id),
        isNull(properties.deletedAt),
        isNotNull(properties.publishedAt),
        inArray(properties.status, [...searchableStatuses]),
      ),
    )
    .orderBy(desc(properties.isFeatured), sql`${properties.publishedAt} desc nulls last`)
    .limit(12);
  const listings = await loadListingCards(
    db,
    listingRows.map((r) => r.id),
  );
  const similarWhere = [
    ...publicWhere(),
    ne(projects.id, p.id),
    or(
      p.locationId ? eq(projects.locationId, p.locationId) : sql`false`,
      p.developerId ? eq(projects.developerId, p.developerId) : sql`false`,
    )!,
  ];
  const similar = await cards(db, similarWhere, 3);

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    status: p.status,
    descriptionHtml: p.descriptionHtml,
    highlights: p.highlights,
    launchDate: p.launchDate,
    handover: p.handoverText || p.handoverDate,
    progress: p.constructionProgress,
    progressUpdatedAt: p.progressUpdatedAt?.toISOString() ?? null,
    startingPrice: p.startingPrice,
    currency: p.currency ?? "",
    totalUnits: p.totalUnits,
    unitTypesSummary: p.unitTypesSummary || bedsRange(unitRows.map((u) => u.beds)),
    planLabel: plan ? plan.summaryLabel || suggestSummaryLabel(plan.steps) || null : null,
    developer: dev
      ? {
          name: dev.name,
          slug: dev.slug,
          logo: await getPublicMedia(dev.logoId),
          description: dev.description,
          website: dev.website,
        }
      : null,
    locationPath: path,
    point: p.point,
    photos: mediaRows
      .filter((m) => m.kind === "photo")
      .map((m) => ({
        url: mediaUrl(m.key),
        alt: m.alt || m.libraryAlt || "",
        color: m.color,
        width: m.width,
        height: m.height,
      })),
    masterPlan: masterPlan
      ? {
          url: mediaUrl(masterPlan.key),
          alt: masterPlan.alt ?? "",
          isPdf: masterPlan.mime === "application/pdf",
        }
      : null,
    brochure: brochure ? { url: mediaUrl(brochure.key), fileName: brochure.fileName } : null,
    videoUrl: p.videoUrl,
    tourUrl: p.tourUrl,
    facilities: facilityRows,
    unitTypes: unitRows.map((u) => ({
      id: u.id,
      name: u.name,
      beds: u.beds,
      baths: u.baths,
      sizeMin: u.sizeMin,
      sizeMax: u.sizeMax,
      priceFrom: u.priceFrom,
      floorPlanUrl: u.floorPlanKey ? mediaUrl(u.floorPlanKey) : null,
      availableCount: u.availableCount,
    })),
    plan: plan ? { steps: plan.steps, summaryLabel: plan.summaryLabel, notes: plan.notes } : null,
    nearby: nearby.map((n) => ({
      id: n.id,
      name: n.name,
      typeName: n.typeName,
      category: n.category,
      distanceM: n.straightDistanceM,
      seconds: n.travelMode === "walk" ? n.walkSeconds : n.driveSeconds,
      mode: n.travelMode,
      overrideText: n.overrideText,
      point: poiPoints.find((x) => x.id === n.poiId)?.point ?? null,
    })),
    listings,
    similar,
    seo: {
      title: p.seoTitle,
      description: p.seoDescription,
      canonicalUrl: p.canonicalUrl,
      noindex: p.noindex,
      ogImageId: p.ogImageId,
    },
  };
}
