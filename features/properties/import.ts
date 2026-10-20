import "server-only";
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DbOrTx, Tx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { facilities, locations, propertyTypes } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { properties, propertyFacilities } from "@/db/schema/properties";
import { loadSettings } from "@/features/settings/queries";
import { enqueue } from "@/jobs/enqueue";
import { writeAudit, type AuditActor } from "@/lib/audit";
import { refreshAutoBadges } from "./badges";
import type { ImportContext, ImportDraft } from "./csv";
import { nextPropertyReference } from "./reference";
import { propertySlug } from "./write";

/** CSV import (07 §7), server side. The checks themselves live in ./csv (shared with the browser). */

/** Everything a row is matched against: settings and the agency's master data. */
export async function loadImportContext(db: DbOrTx): Promise<ImportContext> {
  const agency = currentAgencyId();
  const market = await loadSettings("market", db);
  const general = await loadSettings("general", db);
  const parent = alias(locations, "parent");
  const typeRows = await db
    .select({ id: propertyTypes.id, name: propertyTypes.name, slug: propertyTypes.slug })
    .from(propertyTypes)
    .where(eq(propertyTypes.agencyId, agency))
    .orderBy(asc(propertyTypes.sortOrder), asc(propertyTypes.name));
  const locationRows = await db
    .select({
      id: locations.id,
      name: locations.name,
      slug: locations.slug,
      parentName: parent.name,
    })
    .from(locations)
    .leftJoin(parent, eq(parent.id, locations.parentId))
    .where(eq(locations.agencyId, agency))
    .orderBy(asc(locations.name));
  const agentRows = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      email: agents.email,
      isActive: agents.isActive,
    })
    .from(agents)
    .where(eq(agents.agencyId, agency))
    .orderBy(asc(agents.name));
  const facilityRows = await db
    .select({ id: facilities.id, name: facilities.name })
    .from(facilities)
    .where(eq(facilities.agencyId, agency))
    .orderBy(asc(facilities.name));
  return {
    areaUnit: market.areaUnit,
    dateOrder: general.dateFormat === "MM/dd/yyyy" ? "mdy" : "dmy",
    baseCurrency: market.baseCurrency.code,
    currencies: Object.fromEntries(
      [...market.visitorCurrencies, market.baseCurrency].map((c) => [c.code, c.decimals]),
    ),
    rentPeriod: market.rentPeriod,
    furnishingOptions: market.furnishingOptions,
    ownershipTypes: market.ownershipTypes,
    types: typeRows,
    locations: locationRows,
    agents: agentRows,
    facilities: facilityRows,
  };
}

/**
 * One checked row as a draft: next reference, unique slug, never published. Photo addresses
 * become `media.fetch_url` jobs, so a slow site never holds up the import.
 */
export async function createImportedDraft(
  tx: Tx,
  draft: ImportDraft,
  meta: { actor: AuditActor; userId: string; line: number; locationText: string | null },
): Promise<{ id: string; reference: string; photos: number }> {
  const reference = await nextPropertyReference(tx);
  const [row] = await tx
    .insert(properties)
    .values({
      reference,
      title: draft.title,
      slug: await propertySlug(tx, draft.title || reference, null),
      purpose: draft.purpose,
      status: "draft",
      completion: draft.completion,
      propertyTypeId: draft.propertyTypeId,
      locationId: draft.locationId,
      addressLine: draft.addressLine,
      buildingName: draft.buildingName,
      unitNumber: draft.unitNumber,
      floor: draft.floor,
      point: draft.point,
      price: draft.price,
      currency: draft.currency,
      priceOnRequest: draft.priceOnRequest,
      pricePeriod: draft.pricePeriod,
      serviceChargePerArea: draft.serviceChargePerArea,
      depositAmount: draft.depositAmount,
      agencyFeeText: draft.agencyFeeText,
      beds: draft.beds,
      baths: draft.baths,
      size: draft.size,
      plotSize: draft.plotSize,
      yearBuilt: draft.yearBuilt,
      parkingSpaces: draft.parkingSpaces,
      furnishing: draft.furnishing,
      ownership: draft.ownership,
      view: draft.view,
      maidRoom: draft.maidRoom,
      study: draft.study,
      handoverDate: draft.handoverDate,
      handoverText: draft.handoverText,
      constructionProgress: draft.constructionProgress,
      expectedRentYearly: draft.expectedRentYearly,
      isTenanted: draft.isTenanted,
      tenancyEndDate: draft.tenancyEndDate,
      description: draft.description,
      highlights: draft.highlights,
      videoUrl: draft.videoUrl,
      tourUrl: draft.tourUrl,
      permitNumber: draft.permitNumber,
      agentId: draft.agentId,
      seoTitle: draft.seoTitle,
      seoDescription: draft.seoDescription,
      searchText: meta.locationText,
      source: "import",
      createdBy: meta.userId,
      updatedBy: meta.userId,
    })
    .returning({ id: properties.id, reference: properties.reference });
  const id = row!.id;
  if (draft.facilityIds.length)
    await tx
      .insert(propertyFacilities)
      .values(draft.facilityIds.map((facilityId) => ({ propertyId: id, facilityId })));
  await writeAudit(tx, {
    actor: meta.actor,
    action: "property.create",
    entityType: "property",
    entityId: id,
    after: {
      reference,
      title: draft.title,
      source: "import",
      line: meta.line,
      photos: draft.photoUrls.length,
    },
  });
  await refreshAutoBadges(tx, [id]);
  for (const [i, url] of draft.photoUrls.entries()) {
    await enqueue(
      "media.fetch_url",
      { propertyId: id, url, sortOrder: i, userId: meta.userId },
      { db: tx, dedupeKey: `media.fetch_url:${id}:${i}`, maxAttempts: 3 },
    );
  }
  return { id, reference: row!.reference, photos: draft.photoUrls.length };
}

/** Location words a draft can be found by in the admin search before its first save. */
export function locationSearchText(ctx: ImportContext, locationId: string | null): string | null {
  const loc = ctx.locations.find((l) => l.id === locationId);
  return loc ? [loc.name, loc.parentName].filter(Boolean).join(" ") : null;
}
