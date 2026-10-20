"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { properties, propertyPois } from "@/db/schema/properties";
import { runJob } from "@/jobs/runner";
import { ActionError, adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { tags } from "@/lib/cache-tags";
import { pendingPoiJob, queuePoiCompute } from "./distances";
import { listPropertyPois } from "./nearby-queries";

/**
 * The editor's "Nearby" section (07 §4.5): recalculate, show or hide a place, write the text
 * shown instead of the measured one, and order the list.
 */

/** The current list and last run, for the editor to follow a measurement in the background. */
export const getPropertyPois = adminAction(
  z.object({ propertyId: z.uuid() }),
  {},
  async ({ propertyId }) => {
    const db = await getDb();
    const [listing] = await db
      .select({ id: properties.id })
      .from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.agencyId, currentAgencyId())));
    if (!listing) throw new ActionError("This listing no longer exists.", "NOT_FOUND");
    return listPropertyPois(db, propertyId);
  },
);

/** "Recalculate": measures now and returns the fresh list (a run already waiting is reused). */
export const recalculatePropertyPois = adminAction(
  z.object({ propertyId: z.uuid() }),
  { write: true },
  async ({ propertyId }, ctx) => {
    const db = await getDb();
    const [listing] = await db
      .select({ id: properties.id, hasPin: properties.point })
      .from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.agencyId, currentAgencyId())));
    if (!listing) throw new ActionError("This listing no longer exists.", "NOT_FOUND");
    if (!listing.hasPin)
      throw new ActionError("Drop the pin on the map first, then recalculate.", "NO_PIN");
    const jobId = (await queuePoiCompute(db, propertyId)) ?? (await pendingPoiJob(db, propertyId));
    // Run it here so the admin sees the result; a queue worker that gets it later skips it.
    if (jobId) await runJob(jobId);
    await writeAudit(db, {
      actor: ctx.actor,
      action: "property.pois_recalculate",
      entityType: "property",
      entityId: propertyId,
    });
    updateTag(tags.listing(propertyId));
    return listPropertyPois(db, propertyId);
  },
);

export const updatePropertyPoi = adminAction(
  z
    .object({
      id: z.uuid(),
      isShown: z.boolean().optional(),
      /** Shown on the site instead of the measured time; empty removes it. */
      overrideText: z.string().trim().max(120, "Use at most 120 characters").optional(),
    })
    .strict()
    .refine((v) => v.isShown !== undefined || v.overrideText !== undefined, "Nothing to change"),
  { write: true },
  async ({ id, isShown, overrideText }, ctx) => {
    const db = await getDb();
    return db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(propertyPois)
        .where(and(eq(propertyPois.id, id), eq(propertyPois.agencyId, currentAgencyId())));
      if (!before) throw new ActionError("This place is no longer on the listing.", "NOT_FOUND");
      const [after] = await tx
        .update(propertyPois)
        .set({
          ...(isShown !== undefined ? { isShown } : {}),
          ...(overrideText !== undefined
            ? { overrideText: overrideText || null, isManualOverride: overrideText.length > 0 }
            : {}),
        })
        .where(eq(propertyPois.id, id))
        .returning();
      const pick = (r: typeof before) => ({
        poiId: r.poiId,
        isShown: r.isShown,
        overrideText: r.overrideText,
      });
      await auditChange(tx, {
        actor: ctx.actor,
        action: "property.poi_update",
        entityType: "property",
        entityId: before.propertyId,
        before: pick(before),
        after: pick(after!),
      });
      updateTag(tags.listing(before.propertyId));
      return {
        id,
        isShown: after!.isShown,
        overrideText: after!.overrideText,
        isManualOverride: after!.isManualOverride,
      };
    });
  },
);

/** Drag to order: `ids` is every place on the listing, in the new order. */
export const reorderPropertyPois = adminAction(
  z.object({ propertyId: z.uuid(), ids: z.array(z.uuid()).min(1).max(300) }).strict(),
  { write: true },
  async ({ propertyId, ids }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: propertyPois.id })
        .from(propertyPois)
        .where(
          and(
            eq(propertyPois.propertyId, propertyId),
            eq(propertyPois.agencyId, currentAgencyId()),
          ),
        );
      const have = new Set(rows.map((r) => r.id));
      if (
        new Set(ids).size !== ids.length ||
        ids.length !== have.size ||
        ids.some((i) => !have.has(i))
      )
        throw new ActionError("The list changed in the meantime. Reload and try again.", "STALE");
      for (const [i, id] of ids.entries())
        await tx.update(propertyPois).set({ sortOrder: i }).where(eq(propertyPois.id, id));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "property.pois_reorder",
        entityType: "property",
        entityId: propertyId,
        after: { order: ids },
      });
    });
    updateTag(tags.listing(propertyId));
    return { ids };
  },
);
