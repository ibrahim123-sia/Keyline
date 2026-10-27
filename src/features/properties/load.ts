import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { propertyTypes } from "@/db/schema/master-data";
import { media } from "@/db/schema/media";
import {
  properties,
  propertyBadges,
  propertyFacilities,
  propertyMedia,
} from "@/db/schema/properties";
import { planProblem } from "@/features/payment-plans/schema";
import { loadPlan, planInput } from "@/features/payment-plans/store";
import { loadSettings } from "@/features/settings/queries";
import type { PropertyInput, PublishContext } from "./schema";

export type PropertyRecord = typeof properties.$inferSelect;

/** A listing as the editor works with it, plus its stored row. */
export async function loadProperty(
  db: DbOrTx,
  id: string,
): Promise<{ row: PropertyRecord; input: PropertyInput } | null> {
  const [row] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), eq(properties.agencyId, currentAgencyId())));
  if (!row) return null;
  // One after another: inside a transaction they share one connection.
  const mediaRows = await db
    .select()
    .from(propertyMedia)
    .where(eq(propertyMedia.propertyId, id))
    .orderBy(
      sql`array_position(array['photo','floor_plan','video','brochure','document']::text[], ${propertyMedia.kind})`,
      asc(propertyMedia.sortOrder),
    );
  const facilityRows = await db
    .select({ id: propertyFacilities.facilityId })
    .from(propertyFacilities)
    .where(eq(propertyFacilities.propertyId, id));
  const badgeRows = await db
    .select({ id: propertyBadges.badgeId })
    .from(propertyBadges)
    .where(and(eq(propertyBadges.propertyId, id), eq(propertyBadges.isAuto, false)));
  const plan = row.paymentPlanId ? await loadPlan(db, row.paymentPlanId) : null;
  return {
    row,
    input: {
      purpose: row.purpose,
      completion: row.completion,
      propertyTypeId: row.propertyTypeId,
      title: row.title,
      agentId: row.agentId,
      isFeatured: row.isFeatured,
      featuredUntil: row.featuredUntil ? row.featuredUntil.toISOString().slice(0, 10) : null,
      locationId: row.locationId,
      buildingName: row.buildingName ?? "",
      addressLine: row.addressLine ?? "",
      unitNumber: row.unitNumber ?? "",
      floor: row.floor ?? "",
      point: row.point,
      mapPinExact: row.mapPinExact,
      price: row.price,
      currency: row.currency ?? "USD",
      priceOnRequest: row.priceOnRequest,
      pricePeriod: row.pricePeriod,
      serviceChargePerArea: row.serviceChargePerArea,
      rentPaymentOptions: row.rentPaymentOptions,
      monthlyPaymentAvailable: row.monthlyPaymentAvailable,
      depositAmount: row.depositAmount,
      agencyFeeText: row.agencyFeeText ?? "",
      beds: row.beds,
      baths: row.baths,
      size: row.size,
      plotSize: row.plotSize,
      yearBuilt: row.yearBuilt,
      parkingSpaces: row.parkingSpaces,
      furnishing: row.furnishing ?? "",
      ownership: row.ownership ?? "",
      view: row.view,
      floorCount: row.floorCount,
      maidRoom: row.maidRoom,
      study: row.study,
      projectId: row.projectId,
      projectUnitTypeId: row.projectUnitTypeId,
      handoverDate: row.handoverDate,
      handoverText: row.handoverText ?? "",
      constructionProgress: row.constructionProgress,
      paymentPlan: plan ? planInput(plan) : null,
      expectedRentYearly: row.expectedRentYearly,
      isTenanted: row.isTenanted,
      tenancyEndDate: row.tenancyEndDate,
      description: row.description,
      highlights: row.highlights,
      videoUrl: row.videoUrl,
      tourUrl: row.tourUrl,
      media: mediaRows.map((m) => ({
        mediaId: m.mediaId,
        kind: m.kind,
        isCover: m.isCover,
        caption: m.caption ?? "",
        alt: m.alt ?? "",
      })),
      facilityIds: facilityRows.map((f) => f.id),
      badgeIds: badgeRows.map((b) => b.id),
      permitNumber: row.permitNumber ?? "",
      isVerified: row.isVerified,
      lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
      slug: row.slug,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      canonicalUrl: row.canonicalUrl,
      noindex: row.noindex,
      ogImageId: row.ogImageId,
    },
  };
}

/** What `publishProblems` needs besides the listing itself. */
export async function publishContextFor(db: DbOrTx, input: PropertyInput): Promise<PublishContext> {
  const market = await loadSettings("market", db);
  const [type] = input.propertyTypeId
    ? await db
        .select({ hidden: propertyTypes.fieldsHidden })
        .from(propertyTypes)
        .where(eq(propertyTypes.id, input.propertyTypeId))
    : [];
  const photoIds = input.media.filter((m) => m.kind === "photo").map((m) => m.mediaId);
  const alts = photoIds.length
    ? await db
        .select({ id: media.id, alt: media.alt })
        .from(media)
        .where(inArray(media.id, photoIds))
    : [];
  return {
    hiddenFields: type?.hidden ?? [],
    permitRequired: market.permit.enabled && market.permit.requiredOnPublish,
    permitLabel: market.permit.label,
    libraryAlt: new Map(alts.map((a) => [a.id, a.alt])),
    planProblem: input.paymentPlan ? planProblem(input.paymentPlan.steps) : null,
  };
}
