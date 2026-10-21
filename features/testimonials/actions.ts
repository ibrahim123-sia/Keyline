"use server";

import { and, count, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { testimonials } from "@/db/schema/content";
import { checkImages, checkListings } from "@/features/content/checks";
import { syncMediaUsage } from "@/features/media/usage";
import { ActionError, adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { tags } from "@/lib/cache-tags";
import { testimonialInputSchema } from "./schema";

async function find(db: DbOrTx, id: string) {
  const [row] = await db
    .select()
    .from(testimonials)
    .where(and(eq(testimonials.id, id), eq(testimonials.agencyId, currentAgencyId())));
  if (!row) throw new ActionError("This testimonial no longer exists.", "NOT_FOUND");
  return row;
}

/** Add or edit a testimonial (08 §5); new ones go to the end of the list. */
export const saveTestimonial = adminAction(
  z.object({ id: z.uuid().nullable(), data: testimonialInputSchema }),
  { write: true },
  async ({ id, data }, ctx) => {
    const db = await getDb();
    const saved = await db.transaction(async (tx) => {
      await checkImages(tx, [{ id: data.photoId, field: "photoId" }]);
      if (data.propertyId) await checkListings(tx, [data.propertyId], "propertyId");
      const values = {
        name: data.name,
        roleText: data.roleText || null,
        quote: data.quote,
        rating: data.rating,
        photoId: data.photoId,
        propertyId: data.propertyId,
        isPublished: data.isPublished,
        updatedBy: ctx.user.id,
      };
      if (id) {
        const before = await find(tx, id);
        const [after] = await tx
          .update(testimonials)
          .set(values)
          .where(eq(testimonials.id, id))
          .returning();
        await auditChange(tx, {
          actor: ctx.actor,
          action: "testimonial.update",
          entityType: "testimonial",
          entityId: id,
          before,
          after: after!,
        });
        await syncMediaUsage(tx, [before.photoId, after!.photoId]);
        return after!;
      }
      const [{ n } = { n: 0 }] = await tx
        .select({ n: count() })
        .from(testimonials)
        .where(eq(testimonials.agencyId, currentAgencyId()));
      const [created] = await tx
        .insert(testimonials)
        .values({ ...values, sortOrder: n, createdBy: ctx.user.id })
        .returning();
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "testimonial.create",
        entityType: "testimonial",
        entityId: created!.id,
        after: created!,
      });
      await syncMediaUsage(tx, [created!.photoId]);
      return created!;
    });
    updateTag(tags.testimonials);
    return { id: saved.id };
  },
);

export const setTestimonialPublished = adminAction(
  z.object({ id: z.uuid(), published: z.boolean() }),
  { write: true },
  async ({ id, published }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const before = await find(tx, id);
      await tx
        .update(testimonials)
        .set({ isPublished: published, updatedBy: ctx.user.id })
        .where(eq(testimonials.id, id));
      await auditChange(tx, {
        actor: ctx.actor,
        action: published ? "testimonial.publish" : "testimonial.unpublish",
        entityType: "testimonial",
        entityId: id,
        before: { isPublished: before.isPublished },
        after: { isPublished: published },
      });
    });
    updateTag(tags.testimonials);
    return { id, published };
  },
);

/** The order testimonials show in (drag to reorder). */
export const reorderTestimonials = adminAction(
  z.object({ ids: z.array(z.uuid()).min(1).max(500) }),
  { write: true },
  async ({ ids }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries())
        await tx
          .update(testimonials)
          .set({ sortOrder: index })
          .where(and(eq(testimonials.id, id), eq(testimonials.agencyId, currentAgencyId())));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "testimonial.reorder",
        entityType: "testimonial",
        after: { order: ids },
      });
    });
    updateTag(tags.testimonials);
    return { count: ids.length };
  },
);

export const deleteTestimonial = adminAction(
  z.object({ id: z.uuid() }),
  { write: true },
  async ({ id }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const before = await find(tx, id);
      await tx.delete(testimonials).where(eq(testimonials.id, id));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "testimonial.delete",
        entityType: "testimonial",
        entityId: id,
        before,
      });
      await syncMediaUsage(tx, [before.photoId]);
    });
    updateTag(tags.testimonials);
    return { id };
  },
);
