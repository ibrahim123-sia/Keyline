import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { badges, facilities, locations, propertyTypes } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import { agents } from "@/db/schema/people";
import { projectUnitTypes, projects } from "@/db/schema/projects";
import {
  priceHistory,
  properties,
  propertyBadges,
  propertyFacilities,
  propertyMedia,
} from "@/db/schema/properties";
import { syncMediaUsage } from "@/features/media/usage";
import { deletePlan, writePlan } from "@/features/payment-plans/store";
import { queueListingAlerts } from "@/features/alerts/triggers";
import { queuePoiCompute } from "@/features/pois/distances";
import { redirectSlugChange } from "@/features/seo/redirects";
import { ActionError } from "@/lib/actions";
import { auditChange, type AuditActor } from "@/lib/audit";
import { renderRichText } from "@/lib/rich-text";
import { slugify } from "@/lib/slug";
import { refreshAutoBadges } from "./badges";
import { loadProperty, publishContextFor } from "./load";
import { publishProblems, type PropertyInput } from "./schema";
import { isLiveStatus } from "./status";
import { propertySlug } from "./write";

export type SaveResult = {
  updatedAt: string;
  slug: string;
  paymentPlanId: string | null;
  pointMoved: boolean;
  projectIds: Array<string | null>;
};

const fieldError = (field: string, message: string): never => {
  throw new ActionError("Please check the highlighted fields.", "VALIDATION", {
    [field]: [message],
  });
};

const kindNames: Record<PropertyInput["media"][number]["kind"], string> = {
  photo: "a photo",
  floor_plan: "a floor plan",
  video: "a video",
  brochure: "a brochure",
  document: "a document",
};

/** Photos are images; floor plans images or PDF; brochures PDF; videos video files. */
export function fitsKind(kind: PropertyInput["media"][number]["kind"], mime: string): boolean {
  switch (kind) {
    case "photo":
      return mime.startsWith("image/");
    case "floor_plan":
      return mime.startsWith("image/") || mime === "application/pdf";
    case "brochure":
      return mime === "application/pdf";
    case "video":
      return mime.startsWith("video/");
    default:
      return true;
  }
}

/** Every id in the input points at something of this agency that can be used. */
async function checkReferences(tx: Tx, data: PropertyInput, current: PropertyInput) {
  const agency = currentAgencyId();
  const one = async (table: typeof propertyTypes | typeof locations, id: string | null) =>
    id
      ? (
          await tx
            .select({ id: table.id })
            .from(table)
            .where(and(eq(table.id, id), eq(table.agencyId, agency)))
        ).length > 0
      : true;
  if (!(await one(propertyTypes, data.propertyTypeId)))
    fieldError("propertyTypeId", "This property type no longer exists.");
  if (!(await one(locations, data.locationId)))
    fieldError("locationId", "This location no longer exists.");
  if (data.agentId) {
    const [agent] = await tx
      .select({ isActive: agents.isActive })
      .from(agents)
      .where(and(eq(agents.id, data.agentId), eq(agents.agencyId, agency)));
    if (!agent) fieldError("agentId", "This agent profile no longer exists.");
    if (!agent!.isActive && data.agentId !== current.agentId)
      fieldError("agentId", "This agent profile is turned off.");
  }
  if (data.projectId) {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, data.projectId),
          eq(projects.agencyId, agency),
          isNull(projects.deletedAt),
        ),
      );
    if (!project) fieldError("projectId", "This project no longer exists.");
  }
  if (data.projectUnitTypeId) {
    const [unit] = await tx
      .select({ projectId: projectUnitTypes.projectId })
      .from(projectUnitTypes)
      .where(eq(projectUnitTypes.id, data.projectUnitTypeId));
    if (!unit || unit.projectId !== data.projectId)
      fieldError("projectUnitTypeId", "Choose a unit type of the selected project.");
  }
  if (data.facilityIds.length) {
    const found = await tx
      .select({ id: facilities.id })
      .from(facilities)
      .where(and(inArray(facilities.id, data.facilityIds), eq(facilities.agencyId, agency)));
    if (found.length !== new Set(data.facilityIds).size)
      fieldError("facilityIds", "Some facilities no longer exist. Reload the page.");
  }
  if (data.badgeIds.length) {
    const found = await tx
      .select({ id: badges.id, autoRule: badges.autoRule })
      .from(badges)
      .where(and(inArray(badges.id, data.badgeIds), eq(badges.agencyId, agency)));
    if (found.length !== new Set(data.badgeIds).size)
      fieldError("badgeIds", "Some badges no longer exist. Reload the page.");
    if (found.some((b) => b.autoRule !== "none"))
      fieldError("badgeIds", "Automatic badges are added by the system.");
  }
  const mediaIds = [
    ...new Set([...data.media.map((m) => m.mediaId), ...(data.ogImageId ? [data.ogImageId] : [])]),
  ];
  if (mediaIds.length) {
    const found = await tx
      .select({ id: media.id, mime: media.mime, status: media.status })
      .from(media)
      .where(and(inArray(media.id, mediaIds), eq(media.agencyId, agency)));
    const byId = new Map(found.map((m) => [m.id, m]));
    for (const m of data.media) {
      const file = byId.get(m.mediaId);
      if (!file || file.status === "failed")
        fieldError("media", "A file was removed from the library. Reload the page.");
      if (!fitsKind(m.kind, file!.mime))
        fieldError("media", `This file (${file!.mime}) cannot be used as ${kindNames[m.kind]}.`);
    }
    if (data.ogImageId && !byId.has(data.ogImageId))
      fieldError("ogImageId", "This image was removed from the library.");
  }
}

/** Location names (with the areas above it), project and type: what visitors type to find it. */
export async function searchTextFor(
  tx: Tx,
  data: Pick<PropertyInput, "locationId" | "projectId" | "propertyTypeId">,
): Promise<string> {
  const parts: string[] = [];
  if (data.locationId) {
    const res = await tx.execute<{ names: string | null }>(sql`
      with recursive up as (
        select id, parent_id, name from locations where id = ${data.locationId}::uuid
        union all
        select l.id, l.parent_id, l.name from locations l join up on l.id = up.parent_id
      ) select string_agg(name, ' ') as names from up`);
    if (res.rows[0]?.names) parts.push(res.rows[0].names);
  }
  if (data.projectId) {
    const [p] = await tx
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, data.projectId));
    if (p) parts.push(p.name);
  }
  if (data.propertyTypeId) {
    const [t] = await tx
      .select({ name: propertyTypes.name })
      .from(propertyTypes)
      .where(eq(propertyTypes.id, data.propertyTypeId));
    if (t) parts.push(t.name);
  }
  return parts.join(" ");
}

/** Photos first, then floor plans and the rest, each in the order given; one cover photo. */
function orderedMedia(data: PropertyInput) {
  const photos = data.media.filter((m) => m.kind === "photo");
  const cover = photos.find((m) => m.isCover) ?? photos[0];
  const counters = new Map<string, number>();
  return data.media.map((m) => {
    const n = counters.get(m.kind) ?? 0;
    counters.set(m.kind, n + 1);
    return { ...m, sortOrder: n, isCover: m.kind === "photo" && m === cover };
  });
}

/**
 * Saves the editor (07 §3, autosave and explicit save). A live listing must keep passing the
 * publish rules; drafts may be incomplete. Writes price history after the first publish.
 */
export async function saveListing(
  tx: Tx,
  args: {
    id: string;
    data: PropertyInput;
    expectedUpdatedAt: string;
    actor: AuditActor;
    userId: string;
  },
): Promise<SaveResult> {
  const loaded = await loadProperty(tx, args.id);
  if (!loaded) throw new ActionError("This listing no longer exists.", "NOT_FOUND");
  const { row, input: before } = loaded;
  if (row.deletedAt)
    throw new ActionError("This listing is archived. Restore it first.", "ARCHIVED");
  if (row.updatedAt.toISOString() !== args.expectedUpdatedAt)
    throw new ActionError(
      "Someone else saved this listing since you opened it. Reload to see their changes; yours stay on this page until you do.",
      "CONFLICT",
    );
  const data = args.data;
  await checkReferences(tx, data, before);

  if (isLiveStatus(row.status)) {
    const problems = publishProblems(data, await publishContextFor(tx, data));
    if (problems.length > 0) {
      const fieldErrors: Record<string, string[]> = {};
      for (const p of problems) (fieldErrors[p.field] ??= []).push(p.message);
      throw new ActionError(
        "This listing is live, so these must stay filled in. Fix them, or unpublish it first.",
        "LIVE_RULES",
        fieldErrors,
      );
    }
  }

  // Never-published listings follow their title until the admin sets the slug by hand.
  const followsTitle = row.publishedAt === null && row.slug === slugify(row.title || row.reference);
  const slugBase =
    data.slug && !(followsTitle && data.slug === row.slug)
      ? data.slug
      : data.title || row.reference;
  const slug = await propertySlug(tx, slugBase, row.id);

  let paymentPlanId = row.paymentPlanId;
  if (data.paymentPlan) {
    paymentPlanId = await writePlan(tx, {
      id: row.paymentPlanId,
      input: data.paymentPlan,
      isTemplate: false,
      actor: args.actor,
      userId: args.userId,
    });
  } else if (row.paymentPlanId) {
    await deletePlan(tx, row.paymentPlanId, args.actor);
    paymentPlanId = null;
  }

  const lastVerifiedAt = data.lastVerifiedAt
    ? new Date(Math.min(Date.parse(data.lastVerifiedAt), Date.now()))
    : null;
  const verifiedChanged =
    data.isVerified &&
    (!row.isVerified || (lastVerifiedAt?.getTime() ?? 0) !== (row.lastVerifiedAt?.getTime() ?? 0));

  const [after] = await tx
    .update(properties)
    .set({
      purpose: data.purpose,
      completion: data.completion,
      propertyTypeId: data.propertyTypeId,
      title: data.title,
      agentId: data.agentId,
      isFeatured: data.isFeatured,
      featuredUntil:
        data.isFeatured && data.featuredUntil ? new Date(`${data.featuredUntil}T23:59:59Z`) : null,
      locationId: data.locationId,
      buildingName: data.buildingName || null,
      addressLine: data.addressLine || null,
      unitNumber: data.unitNumber || null,
      floor: data.floor || null,
      point: data.point,
      mapPinExact: data.mapPinExact,
      price: data.price,
      currency: data.currency,
      priceOnRequest: data.priceOnRequest,
      pricePeriod: data.purpose === "rent" ? data.pricePeriod : null,
      serviceChargePerArea: data.serviceChargePerArea,
      rentPaymentOptions: data.purpose === "rent" ? data.rentPaymentOptions : [],
      monthlyPaymentAvailable: data.purpose === "rent" && data.monthlyPaymentAvailable,
      depositAmount: data.purpose === "rent" ? data.depositAmount : null,
      agencyFeeText: data.agencyFeeText || null,
      beds: data.beds,
      baths: data.baths,
      size: data.size,
      plotSize: data.plotSize,
      yearBuilt: data.yearBuilt,
      parkingSpaces: data.parkingSpaces,
      furnishing: data.furnishing || null,
      ownership: data.ownership || null,
      view: data.view,
      floorCount: data.floorCount,
      maidRoom: data.maidRoom,
      study: data.study,
      projectId: data.projectId,
      projectUnitTypeId: data.projectId ? data.projectUnitTypeId : null,
      handoverDate: data.handoverDate,
      handoverText: data.handoverText || null,
      constructionProgress: data.constructionProgress,
      paymentPlanId,
      expectedRentYearly: data.purpose === "sale" ? data.expectedRentYearly : null,
      isTenanted: data.isTenanted,
      tenancyEndDate: data.isTenanted ? data.tenancyEndDate : null,
      description: data.description,
      descriptionHtml: renderRichText(data.description) || null,
      highlights: data.highlights,
      videoUrl: data.videoUrl,
      tourUrl: data.tourUrl,
      permitNumber: data.permitNumber || null,
      isVerified: data.isVerified,
      lastVerifiedAt: data.isVerified ? lastVerifiedAt : null,
      verifiedBy: data.isVerified ? (verifiedChanged ? args.userId : row.verifiedBy) : null,
      searchText: await searchTextFor(tx, data),
      slug,
      seoTitle: data.seoTitle || null,
      seoDescription: data.seoDescription || null,
      canonicalUrl: data.canonicalUrl,
      noindex: data.noindex,
      ogImageId: data.ogImageId,
      updatedBy: args.userId,
    })
    .where(eq(properties.id, row.id))
    .returning();

  await tx.delete(propertyMedia).where(eq(propertyMedia.propertyId, row.id));
  const items = orderedMedia(data);
  if (items.length)
    await tx.insert(propertyMedia).values(
      items.map((m) => ({
        propertyId: row.id,
        mediaId: m.mediaId,
        kind: m.kind,
        sortOrder: m.sortOrder,
        isCover: m.isCover,
        caption: m.caption || null,
        alt: m.alt || null,
      })),
    );
  await tx.delete(propertyFacilities).where(eq(propertyFacilities.propertyId, row.id));
  const facilityIds = [...new Set(data.facilityIds)];
  if (facilityIds.length)
    await tx
      .insert(propertyFacilities)
      .values(facilityIds.map((facilityId) => ({ propertyId: row.id, facilityId })));
  await tx
    .delete(propertyBadges)
    .where(and(eq(propertyBadges.propertyId, row.id), eq(propertyBadges.isAuto, false)));
  const badgeIds = [...new Set(data.badgeIds)];
  if (badgeIds.length)
    await tx
      .insert(propertyBadges)
      .values(badgeIds.map((badgeId) => ({ propertyId: row.id, badgeId, isAuto: false })))
      .onConflictDoUpdate({
        target: [propertyBadges.propertyId, propertyBadges.badgeId],
        set: { isAuto: false, expiresAt: null, reason: null },
      });

  // Price history from the first publish on (07 §3 "on save events").
  if (row.publishedAt && row.price !== data.price) {
    await tx.insert(priceHistory).values({
      propertyId: row.id,
      oldPrice: row.price,
      newPrice: data.price,
      currency: data.currency,
      changedBy: args.userId,
    });
    // 12 §3: a lower price tells the people who saved it (same currency only).
    if (row.price !== null && data.price !== null && row.currency === data.currency)
      await queueListingAlerts(tx, {
        kind: "price",
        propertyId: row.id,
        oldPrice: row.price,
        newPrice: data.price,
        currency: data.currency ?? "",
      });
  }

  if (row.publishedAt && row.slug !== slug)
    await redirectSlugChange(tx, {
      entity: "property",
      entityId: row.id,
      oldSlug: row.slug,
      newSlug: slug,
      actorId: args.userId,
    });

  const { paymentPlan: _a, ...beforeAudit } = before;
  const { paymentPlan: _b, ...afterAudit } = { ...data, slug };
  await auditChange(tx, {
    actor: args.actor,
    action: "property.update",
    entityType: "property",
    entityId: row.id,
    before: beforeAudit,
    after: afterAudit,
  });
  await syncMediaUsage(tx, [
    ...before.media.map((m) => m.mediaId),
    ...data.media.map((m) => m.mediaId),
    before.ogImageId,
    data.ogImageId,
  ]);
  await refreshAutoBadges(tx, [row.id]);

  const pointMoved =
    (before.point?.lng ?? null) !== (data.point?.lng ?? null) ||
    (before.point?.lat ?? null) !== (data.point?.lat ?? null);
  // 07 §4: a dropped or moved pin measures the nearby places again (in the background).
  if (pointMoved && data.point) await queuePoiCompute(tx, row.id);
  return {
    updatedAt: after!.updatedAt.toISOString(),
    slug,
    paymentPlanId,
    pointMoved,
    projectIds: [row.projectId, data.projectId],
  };
}
