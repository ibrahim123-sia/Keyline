"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { badges, propertyTypes } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import {
  properties,
  propertyBadges,
  propertyFacilities,
  propertyMedia,
  propertyPois,
} from "@/db/schema/properties";
import { syncMediaUsage } from "@/features/media/usage";
import { writePlan } from "@/features/payment-plans/store";
import { loadSettings } from "@/features/settings/queries";
import { ActionError, adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { refreshAutoBadges } from "./badges";
import { loadProperty } from "./load";
import { nextPropertyReference } from "./reference";
import { newPropertySchema, statusSchema } from "./schema";
import { changeStatus } from "./status-change";
import { propertySlug, revalidateListings } from "./write";

/** "New property" (07 §2): a draft with a reference, opened in the editor next. */
export const createProperty = adminAction(
  newPropertySchema,
  { write: true },
  async (input, ctx) => {
    const db = await getDb();
    const created = await db.transaction(async (tx) => {
      const [type] = await tx
        .select({ id: propertyTypes.id, name: propertyTypes.name })
        .from(propertyTypes)
        .where(
          and(
            eq(propertyTypes.id, input.propertyTypeId),
            eq(propertyTypes.agencyId, currentAgencyId()),
          ),
        );
      if (!type)
        throw new ActionError("Choose a property type.", "VALIDATION", {
          propertyTypeId: ["This property type no longer exists."],
        });
      const market = await loadSettings("market", tx);
      const reference = await nextPropertyReference(tx);
      const [row] = await tx
        .insert(properties)
        .values({
          reference,
          title: input.title,
          slug: await propertySlug(tx, input.title || reference, null),
          purpose: input.purpose,
          completion: input.completion,
          propertyTypeId: type.id,
          currency: market.baseCurrency.code,
          pricePeriod: input.purpose === "rent" ? market.rentPeriod : null,
          source: "manual",
          createdBy: ctx.user.id,
          updatedBy: ctx.user.id,
        })
        .returning();
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "property.create",
        entityType: "property",
        entityId: row!.id,
        after: { reference, title: row!.title, purpose: row!.purpose, completion: row!.completion },
      });
      await refreshAutoBadges(tx, [row!.id]);
      return row!;
    });
    return { id: created.id, reference: created.reference };
  },
);

const bulkActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), status: statusSchema }),
  z.object({ type: z.literal("agent"), agentId: z.uuid().nullable() }),
  z.object({ type: z.literal("badge"), badgeId: z.uuid(), add: z.boolean() }),
  z.object({ type: z.literal("feature"), featured: z.boolean() }),
  z.object({ type: z.literal("verify") }),
  z.object({ type: z.literal("archive") }),
  z.object({ type: z.literal("restore") }),
]);

export type BulkResult = {
  updated: number;
  skipped: Array<{ id: string; reference: string; reason: string }>;
};

/** Bulk actions on the property list (07 §2). Listings that cannot change are skipped, with why. */
export const bulkUpdateProperties = adminAction(
  z.object({ ids: z.array(z.uuid()).min(1).max(500), action: bulkActionSchema }),
  { write: true },
  async ({ ids, action }, ctx) => {
    const db = await getDb();
    const result: BulkResult = { updated: 0, skipped: [] };
    const projectIds: Array<string | null> = [];
    await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(properties)
        .where(and(inArray(properties.id, ids), eq(properties.agencyId, currentAgencyId())));
      if (action.type === "agent" && action.agentId) {
        const [agent] = await tx
          .select({ id: agents.id, isActive: agents.isActive })
          .from(agents)
          .where(and(eq(agents.id, action.agentId), eq(agents.agencyId, currentAgencyId())));
        if (!agent?.isActive)
          throw new ActionError("Choose an active agent profile.", "VALIDATION");
      }
      if (action.type === "badge") {
        const [badge] = await tx
          .select({ autoRule: badges.autoRule })
          .from(badges)
          .where(and(eq(badges.id, action.badgeId), eq(badges.agencyId, currentAgencyId())));
        if (!badge) throw new ActionError("This badge no longer exists.", "NOT_FOUND");
        if (badge.autoRule !== "none")
          throw new ActionError(
            "This badge is added automatically, so it cannot be added or removed by hand.",
            "AUTO_BADGE",
          );
      }

      for (const row of rows) {
        projectIds.push(row.projectId);
        const skip = (reason: string) =>
          result.skipped.push({ id: row.id, reference: row.reference, reason });
        const archived = row.deletedAt !== null;
        if (archived && action.type !== "restore") {
          skip("Archived");
          continue;
        }
        switch (action.type) {
          case "status": {
            const res = await changeStatus(tx, {
              id: row.id,
              next: action.status,
              actor: ctx.actor,
              userId: ctx.user.id,
            });
            if (!res.ok) skip(res.problems.map((p) => p.message).join(" "));
            else if (res.changed) result.updated++;
            continue;
          }
          case "badge": {
            if (action.add) {
              await tx
                .insert(propertyBadges)
                .values({ propertyId: row.id, badgeId: action.badgeId, isAuto: false })
                .onConflictDoUpdate({
                  target: [propertyBadges.propertyId, propertyBadges.badgeId],
                  set: { isAuto: false, expiresAt: null, reason: null },
                });
            } else {
              await tx
                .delete(propertyBadges)
                .where(
                  and(
                    eq(propertyBadges.propertyId, row.id),
                    eq(propertyBadges.badgeId, action.badgeId),
                  ),
                );
            }
            await writeAudit(tx, {
              actor: ctx.actor,
              action: action.add ? "property.badge_add" : "property.badge_remove",
              entityType: "property",
              entityId: row.id,
              after: { badgeId: action.badgeId },
            });
            result.updated++;
            continue;
          }
          default: {
            const now = new Date();
            const patch =
              action.type === "agent"
                ? { agentId: action.agentId }
                : action.type === "feature"
                  ? {
                      isFeatured: action.featured,
                      ...(action.featured ? {} : { featuredUntil: null }),
                    }
                  : action.type === "verify"
                    ? { isVerified: true, lastVerifiedAt: now, verifiedBy: ctx.user.id }
                    : action.type === "archive"
                      ? { deletedAt: now }
                      : { deletedAt: null };
            const [after] = await tx
              .update(properties)
              .set({ ...patch, updatedBy: ctx.user.id })
              .where(eq(properties.id, row.id))
              .returning();
            const pick = (r: typeof row) =>
              Object.fromEntries(Object.keys(patch).map((k) => [k, r[k as keyof typeof row]]));
            await auditChange(tx, {
              actor: ctx.actor,
              action: `property.${action.type}`,
              entityType: "property",
              entityId: row.id,
              before: pick(row),
              after: pick(after!),
            });
            result.updated++;
          }
        }
      }
      if (action.type !== "status" && action.type !== "badge")
        await refreshAutoBadges(
          tx,
          rows.map((r) => r.id),
        );
      if (action.type === "archive" || action.type === "restore") {
        const mediaIds = await tx
          .select({ id: propertyMedia.mediaId })
          .from(propertyMedia)
          .where(
            inArray(
              propertyMedia.propertyId,
              rows.map((r) => r.id),
            ),
          );
        await syncMediaUsage(
          tx,
          mediaIds.map((m) => m.id),
        );
      }
    });
    await revalidateListings(ids, projectIds);
    return result;
  },
);

/** Quick action "duplicate" (07 §2): a new draft with the same details, photos and plan. */
export const duplicateProperty = adminAction(
  z.object({ id: z.uuid() }),
  { write: true },
  async ({ id }, ctx) => {
    const db = await getDb();
    const created = await db.transaction(async (tx) => {
      const source = await loadProperty(tx, id);
      if (!source) throw new ActionError("This listing no longer exists.", "NOT_FOUND");
      const {
        id: _id,
        createdAt: _c,
        updatedAt: _u,
        pricePerArea: _ppa,
        expectedYield: _y,
        searchVector: _sv,
        ...copy
      } = source.row;
      const reference = await nextPropertyReference(tx);
      const title = `${source.row.title || reference} (copy)`.slice(0, 120);
      const planId = source.input.paymentPlan
        ? await writePlan(tx, {
            id: null,
            input: source.input.paymentPlan,
            isTemplate: false,
            actor: ctx.actor,
            userId: ctx.user.id,
          })
        : null;
      const [row] = await tx
        .insert(properties)
        .values({
          ...copy,
          reference,
          title,
          slug: await propertySlug(tx, title, null),
          status: "draft",
          paymentPlanId: planId,
          publishedAt: null,
          originalPrice: null,
          isFeatured: false,
          featuredUntil: null,
          isVerified: false,
          lastVerifiedAt: null,
          verifiedBy: null,
          viewsCount: 0,
          inquiriesCount: 0,
          source: "manual",
          deletedAt: null,
          createdBy: ctx.user.id,
          updatedBy: ctx.user.id,
        })
        .returning();
      const newId = row!.id;
      const mediaRows = await tx
        .select()
        .from(propertyMedia)
        .where(eq(propertyMedia.propertyId, id));
      if (mediaRows.length)
        await tx.insert(propertyMedia).values(
          mediaRows.map(({ id: _m, createdAt: _a, updatedAt: _b, ...m }) => ({
            ...m,
            propertyId: newId,
          })),
        );
      const facilityRows = await tx
        .select()
        .from(propertyFacilities)
        .where(eq(propertyFacilities.propertyId, id));
      if (facilityRows.length)
        await tx
          .insert(propertyFacilities)
          .values(facilityRows.map((f) => ({ ...f, propertyId: newId })));
      const badgeRows = await tx
        .select()
        .from(propertyBadges)
        .where(and(eq(propertyBadges.propertyId, id), eq(propertyBadges.isAuto, false)));
      if (badgeRows.length)
        await tx.insert(propertyBadges).values(badgeRows.map((b) => ({ ...b, propertyId: newId })));
      // Same pin, same distances: no need to ask Google again.
      const poiRows = await tx.select().from(propertyPois).where(eq(propertyPois.propertyId, id));
      if (poiRows.length)
        await tx
          .insert(propertyPois)
          .values(poiRows.map(({ id: _p, ...p }) => ({ ...p, propertyId: newId })));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "property.create",
        entityType: "property",
        entityId: newId,
        after: { reference, title, duplicateOf: source.row.reference },
      });
      await refreshAutoBadges(tx, [newId]);
      await syncMediaUsage(
        tx,
        mediaRows.map((m) => m.mediaId),
      );
      return row!;
    });
    return { id: created.id, reference: created.reference };
  },
);
