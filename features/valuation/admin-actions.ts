"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { leadEvents, leads, listingRequests } from "@/db/schema/crm";
import { locations, propertyTypes } from "@/db/schema/master-data";
import { properties, propertyMedia } from "@/db/schema/properties";
import { syncMediaUsage } from "@/features/media/usage";
import { refreshAutoBadges } from "@/features/properties/badges";
import { nextPropertyReference } from "@/features/properties/reference";
import { searchTextFor } from "@/features/properties/save";
import { propertySlug } from "@/features/properties/write";
import { loadSettings } from "@/features/settings/queries";
import { ActionError, adminAction } from "@/lib/actions";
import { writeAudit } from "@/lib/audit";
import { homeSummary } from "./format";

/**
 * "Create draft listing" from a list-your-property request (11 §6): one click makes a draft
 * with what the owner gave (type, area, building, beds, baths, size, asking price, photos),
 * the lead's agent, and links the request to it. Audited; a request makes one draft only.
 */
export const createDraftFromListingRequest = adminAction(
  z.strictObject({ id: z.uuid() }),
  { write: true },
  async ({ id }, ctx) => {
    const db = await getDb();
    const agency = currentAgencyId();
    return db.transaction(async (tx) => {
      const [req] = await tx
        .select()
        .from(listingRequests)
        .where(and(eq(listingRequests.id, id), eq(listingRequests.agencyId, agency)))
        .for("update");
      if (!req) throw new ActionError("This request no longer exists.", "NOT_FOUND");
      if (req.propertyId) {
        const [existing] = await tx
          .select({ id: properties.id, reference: properties.reference })
          .from(properties)
          .where(eq(properties.id, req.propertyId));
        if (existing) return { ...existing, created: false };
      }
      const market = await loadSettings("market", tx);
      const [type] = req.propertyTypeId
        ? await tx
            .select({ id: propertyTypes.id, name: propertyTypes.name })
            .from(propertyTypes)
            .where(eq(propertyTypes.id, req.propertyTypeId))
        : [];
      const [loc] = req.locationId
        ? await tx
            .select({ id: locations.id, name: locations.name })
            .from(locations)
            .where(eq(locations.id, req.locationId))
        : [];
      const [lead] = req.leadId
        ? await tx.select({ agentId: leads.agentId }).from(leads).where(eq(leads.id, req.leadId))
        : [];
      const purpose = req.purpose === "rent" ? ("rent" as const) : ("sale" as const);
      const reference = await nextPropertyReference(tx);
      const title =
        homeSummary(
          {
            typeName: type?.name ?? null,
            beds: req.beds,
            size: null,
            building: null,
            areaName: loc?.name ?? null,
          },
          market.areaUnit,
        ) || reference;
      const [row] = await tx
        .insert(properties)
        .values({
          reference,
          title,
          slug: await propertySlug(tx, title, null),
          purpose,
          status: "draft",
          completion: "ready",
          propertyTypeId: type?.id ?? null,
          locationId: loc?.id ?? null,
          buildingName: req.building,
          beds: req.beds,
          baths: req.baths,
          size: req.size,
          price: req.askingPrice,
          currency: req.currency ?? market.baseCurrency.code,
          pricePeriod: purpose === "rent" ? market.rentPeriod : null,
          agentId: lead?.agentId ?? null,
          searchText: await searchTextFor(tx, {
            locationId: loc?.id ?? null,
            projectId: null,
            propertyTypeId: type?.id ?? null,
          }),
          source: "manual",
          createdBy: ctx.user.id,
          updatedBy: ctx.user.id,
        })
        .returning({ id: properties.id, reference: properties.reference });
      const propertyId = row!.id;
      for (const [i, mediaId] of req.photoIds.entries())
        await tx
          .insert(propertyMedia)
          .values({ propertyId, mediaId, kind: "photo", sortOrder: i, isCover: i === 0 });
      await tx
        .update(listingRequests)
        .set({ propertyId, updatedBy: ctx.user.id, updatedAt: sql`now()` })
        .where(eq(listingRequests.id, req.id));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "property.create",
        entityType: "property",
        entityId: propertyId,
        after: { reference, title, purpose, source: "listing_request", listingRequestId: req.id },
      });
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "listing_request.convert",
        entityType: "listing_request",
        entityId: req.id,
        before: { propertyId: null },
        after: { propertyId, reference },
      });
      if (req.leadId)
        await tx.insert(leadEvents).values({
          leadId: req.leadId,
          type: "note",
          body: `Draft listing ${reference} created from the list-your-property request.`,
          meta: { propertyId, listingRequestId: req.id },
          actorType: "admin",
          actorId: ctx.user.id,
        });
      await refreshAutoBadges(tx, [propertyId]);
      await syncMediaUsage(tx, req.photoIds);
      return { id: propertyId, reference: row!.reference, created: true };
    });
  },
);
