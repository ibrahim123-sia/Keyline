import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { facilities, locations, poiTypes, pois, propertyTypes } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { agents } from "@/db/schema/people";
import {
  projectFacilities,
  projectMedia,
  projectPois,
  projects,
  projectUnitTypes,
} from "@/db/schema/projects";
import {
  properties,
  propertyFacilities,
  propertyMedia,
  propertyPois,
} from "@/db/schema/properties";
import { mediaUrl } from "@/features/media/queries";
import { isPlanComplete, suggestSummaryLabel } from "@/features/payment-plans/schema";
import { loadPlans, type PlanRecord } from "@/features/payment-plans/store";
import { liveStatuses } from "@/features/properties/status";
import { tags } from "@/lib/cache-tags";
import { grossYield } from "./best";

/**
 * What the compare page shows for each picked home (11 §3), a listing or a project unit type,
 * in the order picked. Only live listings and unit types of published projects; anything else
 * is left out, so an old share link still works for what is left. Public data only.
 */

export type NearestPlace = {
  name: string;
  distanceM: number;
  seconds: number | null;
  mode: "drive" | "walk";
  overrideText: string | null;
};

export type CompareItem = {
  kind: "property" | "unit";
  id: string;
  title: string;
  /** Project name for a unit type. */
  subtitle: string | null;
  href: string;
  photo: { url: string; alt: string; color: string | null } | null;
  purpose: "sale" | "rent";
  completion: "ready" | "off_plan";
  /** Minor units of `currency`; for a unit type, its starting price. */
  price: number | null;
  priceFrom: boolean;
  currency: string;
  pricePeriod: "year" | "month" | null;
  typeName: string | null;
  beds: number | null;
  baths: number | null;
  /** m²; a unit type may give a range. */
  sizeMin: number | null;
  sizeMax: number | null;
  areaName: string | null;
  handover: string | null;
  planLabel: string | null;
  /** Minor units per m² per year. */
  serviceChargePerArea: number | null;
  /** Gross yield in %. */
  expectedYield: number | null;
  nearest: {
    school: NearestPlace | null;
    transport: NearestPlace | null;
    shopping: NearestPlace | null;
  };
  facilities: string[];
  verifiedAt: string | null;
  agent: { name: string; slug: string } | null;
};

type NearbyRow = NearestPlace & { ownerId: string; category: string };

function nearestByCategory(rows: NearbyRow[], ownerId: string): CompareItem["nearest"] {
  const pick = (category: string) => {
    const mine = rows
      .filter((r) => r.ownerId === ownerId && r.category === category)
      .sort((a, b) => a.distanceM - b.distanceM)[0];
    if (!mine) return null;
    const { name, distanceM, seconds, mode, overrideText } = mine;
    return { name, distanceM, seconds, mode, overrideText };
  };
  return { school: pick("schools"), transport: pick("transport"), shopping: pick("shopping") };
}

const planLabel = (plan: PlanRecord | undefined) =>
  plan && isPlanComplete(plan.steps)
    ? plan.summaryLabel || suggestSummaryLabel(plan.steps) || null
    : null;

async function propertyItems(db: DbOrTx, ids: string[]): Promise<CompareItem[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: properties.id,
      slug: properties.slug,
      title: properties.title,
      purpose: properties.purpose,
      completion: properties.completion,
      price: properties.price,
      priceOnRequest: properties.priceOnRequest,
      currency: properties.currency,
      pricePeriod: properties.pricePeriod,
      beds: properties.beds,
      baths: properties.baths,
      size: properties.size,
      handoverDate: properties.handoverDate,
      handoverText: properties.handoverText,
      serviceChargePerArea: properties.serviceChargePerArea,
      expectedRentYearly: properties.expectedRentYearly,
      isVerified: properties.isVerified,
      lastVerifiedAt: properties.lastVerifiedAt,
      paymentPlanId: properties.paymentPlanId,
      typeName: propertyTypes.name,
      areaName: locations.name,
      projectPlanId: projects.paymentPlanId,
      projectHandoverDate: projects.handoverDate,
      projectHandoverText: projects.handoverText,
      agentName: agents.name,
      agentSlug: agents.slug,
      agentActive: agents.isActive,
    })
    .from(properties)
    .leftJoin(propertyTypes, eq(propertyTypes.id, properties.propertyTypeId))
    .leftJoin(locations, eq(locations.id, properties.locationId))
    .leftJoin(projects, and(eq(projects.id, properties.projectId), isNull(projects.deletedAt)))
    .leftJoin(agents, eq(agents.id, properties.agentId))
    .where(
      and(
        inArray(properties.id, ids),
        eq(properties.agencyId, currentAgencyId()),
        isNull(properties.deletedAt),
        inArray(properties.status, [...liveStatuses]),
      ),
    );
  if (rows.length === 0) return [];
  const found = rows.map((r) => r.id);
  for (const id of found) cacheTag(tags.listing(id));

  const photos = await db
    .select({
      ownerId: propertyMedia.propertyId,
      alt: propertyMedia.alt,
      key: media.r2Key,
      libraryAlt: media.alt,
      color: media.dominantColor,
    })
    .from(propertyMedia)
    .innerJoin(media, eq(media.id, propertyMedia.mediaId))
    .where(
      and(
        inArray(propertyMedia.propertyId, found),
        eq(propertyMedia.kind, "photo"),
        eq(media.status, "ready"),
      ),
    )
    .orderBy(sql`${propertyMedia.isCover} desc`, asc(propertyMedia.sortOrder));
  const facilityRows = await db
    .select({ ownerId: propertyFacilities.propertyId, name: facilities.name })
    .from(propertyFacilities)
    .innerJoin(facilities, eq(facilities.id, propertyFacilities.facilityId))
    .where(inArray(propertyFacilities.propertyId, found));
  const nearby: NearbyRow[] = (
    await db
      .select({
        ownerId: propertyPois.propertyId,
        category: poiTypes.category,
        name: pois.name,
        distanceM: propertyPois.straightDistanceM,
        driveSeconds: propertyPois.driveSeconds,
        walkSeconds: propertyPois.walkSeconds,
        travelMode: poiTypes.travelMode,
        isManualOverride: propertyPois.isManualOverride,
        overrideText: propertyPois.overrideText,
      })
      .from(propertyPois)
      .innerJoin(pois, eq(pois.id, propertyPois.poiId))
      .innerJoin(poiTypes, eq(poiTypes.id, pois.poiTypeId))
      .where(
        and(
          inArray(propertyPois.propertyId, found),
          eq(propertyPois.isShown, true),
          eq(poiTypes.showOnProperty, true),
          inArray(poiTypes.category, ["schools", "transport", "shopping"]),
        ),
      )
  ).map((r) => {
    const walk = r.travelMode === "walk" && r.walkSeconds != null;
    return {
      ownerId: r.ownerId,
      category: r.category,
      name: r.name,
      distanceM: r.distanceM,
      seconds: walk ? r.walkSeconds : r.driveSeconds,
      mode: walk ? ("walk" as const) : ("drive" as const),
      overrideText: r.isManualOverride && r.overrideText ? r.overrideText : null,
    };
  });
  const plans = await loadPlans(
    db,
    rows.flatMap((r) => [r.paymentPlanId, r.projectPlanId]).filter((x): x is string => Boolean(x)),
  );

  return rows.map((r) => {
    const photo = photos.find((p) => p.ownerId === r.id);
    const price = r.priceOnRequest ? null : r.price;
    return {
      kind: "property",
      id: r.id,
      title: r.title,
      subtitle: null,
      href: `/property/${r.slug}`,
      photo: photo
        ? { url: mediaUrl(photo.key), alt: photo.alt || photo.libraryAlt || "", color: photo.color }
        : null,
      purpose: r.purpose,
      completion: r.completion,
      price,
      priceFrom: false,
      currency: r.currency ?? "",
      pricePeriod: r.pricePeriod,
      typeName: r.typeName,
      beds: r.beds,
      baths: r.baths,
      sizeMin: r.size,
      sizeMax: r.size,
      areaName: r.areaName,
      handover:
        r.completion === "off_plan"
          ? r.handoverText ||
            r.handoverDate ||
            r.projectHandoverText ||
            r.projectHandoverDate ||
            null
          : null,
      planLabel: planLabel(plans.get(r.paymentPlanId ?? r.projectPlanId ?? "")),
      serviceChargePerArea: r.serviceChargePerArea,
      expectedYield: r.purpose === "sale" ? grossYield(price, r.expectedRentYearly) : null,
      nearest: nearestByCategory(nearby, r.id),
      facilities: facilityRows.filter((f) => f.ownerId === r.id).map((f) => f.name),
      verifiedAt: r.isVerified && r.lastVerifiedAt ? r.lastVerifiedAt.toISOString() : null,
      agent:
        r.agentName && r.agentSlug && r.agentActive
          ? { name: r.agentName, slug: r.agentSlug }
          : null,
    } satisfies CompareItem;
  });
}

async function unitItems(db: DbOrTx, ids: string[]): Promise<CompareItem[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: projectUnitTypes.id,
      name: projectUnitTypes.name,
      beds: projectUnitTypes.beds,
      baths: projectUnitTypes.baths,
      sizeMin: projectUnitTypes.sizeMin,
      sizeMax: projectUnitTypes.sizeMax,
      priceFrom: projectUnitTypes.priceFrom,
      projectId: projects.id,
      projectName: projects.name,
      projectSlug: projects.slug,
      currency: projects.currency,
      handoverDate: projects.handoverDate,
      handoverText: projects.handoverText,
      status: projects.status,
      paymentPlanId: projects.paymentPlanId,
      areaName: locations.name,
    })
    .from(projectUnitTypes)
    .innerJoin(projects, eq(projects.id, projectUnitTypes.projectId))
    .leftJoin(locations, eq(locations.id, projects.locationId))
    .where(
      and(
        inArray(projectUnitTypes.id, ids),
        eq(projects.agencyId, currentAgencyId()),
        eq(projects.isPublished, true),
        isNull(projects.deletedAt),
      ),
    );
  if (rows.length === 0) return [];
  const projectIds = [...new Set(rows.map((r) => r.projectId))];
  for (const id of projectIds) cacheTag(tags.project(id));

  const photos = await db
    .select({
      ownerId: projectMedia.projectId,
      alt: projectMedia.alt,
      key: media.r2Key,
      libraryAlt: media.alt,
      color: media.dominantColor,
    })
    .from(projectMedia)
    .innerJoin(media, eq(media.id, projectMedia.mediaId))
    .where(
      and(
        inArray(projectMedia.projectId, projectIds),
        eq(projectMedia.kind, "photo"),
        eq(media.status, "ready"),
      ),
    )
    .orderBy(sql`${projectMedia.isCover} desc`, asc(projectMedia.sortOrder));
  const facilityRows = await db
    .select({ ownerId: projectFacilities.projectId, name: facilities.name })
    .from(projectFacilities)
    .innerJoin(facilities, eq(facilities.id, projectFacilities.facilityId))
    .where(inArray(projectFacilities.projectId, projectIds));
  const nearby: NearbyRow[] = (
    await db
      .select({
        ownerId: projectPois.projectId,
        category: poiTypes.category,
        name: pois.name,
        distanceM: projectPois.straightDistanceM,
        driveSeconds: projectPois.driveSeconds,
        walkSeconds: projectPois.walkSeconds,
        travelMode: poiTypes.travelMode,
        isManualOverride: projectPois.isManualOverride,
        overrideText: projectPois.overrideText,
      })
      .from(projectPois)
      .innerJoin(pois, eq(pois.id, projectPois.poiId))
      .innerJoin(poiTypes, eq(poiTypes.id, pois.poiTypeId))
      .where(
        and(
          inArray(projectPois.projectId, projectIds),
          eq(projectPois.isShown, true),
          inArray(poiTypes.category, ["schools", "transport", "shopping"]),
        ),
      )
  ).map((r) => {
    const walk = r.travelMode === "walk" && r.walkSeconds != null;
    return {
      ownerId: r.ownerId,
      category: r.category,
      name: r.name,
      distanceM: r.distanceM,
      seconds: walk ? r.walkSeconds : r.driveSeconds,
      mode: walk ? ("walk" as const) : ("drive" as const),
      overrideText: r.isManualOverride && r.overrideText ? r.overrideText : null,
    };
  });
  const plans = await loadPlans(
    db,
    rows.map((r) => r.paymentPlanId).filter((x): x is string => Boolean(x)),
  );

  return rows.map((r) => {
    const photo = photos.find((p) => p.ownerId === r.projectId);
    return {
      kind: "unit",
      id: r.id,
      title: r.name,
      subtitle: r.projectName,
      href: `/projects/${r.projectSlug}#units`,
      photo: photo
        ? { url: mediaUrl(photo.key), alt: photo.alt || photo.libraryAlt || "", color: photo.color }
        : null,
      purpose: "sale",
      completion: r.status === "completed" ? "ready" : "off_plan",
      price: r.priceFrom,
      priceFrom: true,
      currency: r.currency ?? "",
      pricePeriod: null,
      typeName: null,
      beds: r.beds,
      baths: r.baths,
      sizeMin: r.sizeMin ?? r.sizeMax,
      sizeMax: r.sizeMax ?? r.sizeMin,
      areaName: r.areaName,
      handover: r.status === "completed" ? null : r.handoverText || r.handoverDate || null,
      planLabel: planLabel(plans.get(r.paymentPlanId ?? "")),
      serviceChargePerArea: null,
      expectedYield: null,
      nearest: nearestByCategory(nearby, r.projectId),
      facilities: facilityRows.filter((f) => f.ownerId === r.projectId).map((f) => f.name),
      verifiedAt: null,
      agent: null,
    } satisfies CompareItem;
  });
}

/** The picked homes, in the order given (cached; listing and project saves expire it). */
export async function compareItems(ids: string[]): Promise<CompareItem[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(tags.listings, tags.projects);
  if (ids.length === 0) return [];
  const db = await getDb();
  const listings = await propertyItems(db, ids);
  const rest = ids.filter((id) => !listings.some((l) => l.id === id));
  const items = [...listings, ...(await unitItems(db, rest))];
  return ids.flatMap((id) => items.find((i) => i.id === id) ?? []);
}
