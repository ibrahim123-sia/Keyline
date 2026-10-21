"use server";

import { and, count, eq, isNull } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { faqGroups, faqs } from "@/db/schema/content";
import { ActionError, adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { tags } from "@/lib/cache-tags";
import { renderRichText } from "@/lib/rich-text";
import { faqInputSchema } from "./schema";

/** A question of the shared list (area guides keep their own in the guide editor). */
async function find(db: DbOrTx, id: string) {
  const [row] = await db
    .select()
    .from(faqs)
    .where(and(eq(faqs.id, id), eq(faqs.agencyId, currentAgencyId()), isNull(faqs.areaGuideId)));
  if (!row) throw new ActionError("This question no longer exists.", "NOT_FOUND");
  return row;
}

/** Add or edit a question (08 §5); a new one goes to the end of its group. */
export const saveFaq = adminAction(
  z.object({ id: z.uuid().nullable(), data: faqInputSchema }),
  { write: true },
  async ({ id, data }, ctx) => {
    const db = await getDb();
    const saved = await db.transaction(async (tx) => {
      const values = {
        question: data.question,
        answer: data.answer,
        answerHtml: renderRichText(data.answer),
        group: data.group,
        isPublished: data.isPublished,
        updatedBy: ctx.user.id,
      };
      const end = async () => {
        const [{ n } = { n: 0 }] = await tx
          .select({ n: count() })
          .from(faqs)
          .where(
            and(
              eq(faqs.agencyId, currentAgencyId()),
              eq(faqs.group, data.group),
              isNull(faqs.areaGuideId),
            ),
          );
        return n;
      };
      if (id) {
        const before = await find(tx, id);
        const [after] = await tx
          .update(faqs)
          .set({ ...values, ...(before.group !== data.group ? { sortOrder: await end() } : {}) })
          .where(eq(faqs.id, id))
          .returning();
        await auditChange(tx, {
          actor: ctx.actor,
          action: "faq.update",
          entityType: "faq",
          entityId: id,
          before,
          after: after!,
        });
        return after!;
      }
      const [created] = await tx
        .insert(faqs)
        .values({ ...values, sortOrder: await end(), createdBy: ctx.user.id })
        .returning();
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "faq.create",
        entityType: "faq",
        entityId: created!.id,
        after: created!,
      });
      return created!;
    });
    updateTag(tags.faqs);
    return { id: saved.id };
  },
);

export const setFaqPublished = adminAction(
  z.object({ id: z.uuid(), published: z.boolean() }),
  { write: true },
  async ({ id, published }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const before = await find(tx, id);
      await tx
        .update(faqs)
        .set({ isPublished: published, updatedBy: ctx.user.id })
        .where(eq(faqs.id, id));
      await auditChange(tx, {
        actor: ctx.actor,
        action: published ? "faq.publish" : "faq.unpublish",
        entityType: "faq",
        entityId: id,
        before: { isPublished: before.isPublished },
        after: { isPublished: published },
      });
    });
    updateTag(tags.faqs);
    return { id, published };
  },
);

/** The order within one group (drag to reorder). */
export const reorderFaqs = adminAction(
  z.object({ group: z.enum(faqGroups), ids: z.array(z.uuid()).min(1).max(500) }),
  { write: true },
  async ({ group, ids }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries())
        await tx
          .update(faqs)
          .set({ sortOrder: index })
          .where(
            and(
              eq(faqs.id, id),
              eq(faqs.agencyId, currentAgencyId()),
              eq(faqs.group, group),
              isNull(faqs.areaGuideId),
            ),
          );
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "faq.reorder",
        entityType: "faq",
        after: { group, order: ids },
      });
    });
    updateTag(tags.faqs);
    return { count: ids.length };
  },
);

export const deleteFaq = adminAction(
  z.object({ id: z.uuid() }),
  { write: true },
  async ({ id }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const before = await find(tx, id);
      await tx.delete(faqs).where(eq(faqs.id, id));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "faq.delete",
        entityType: "faq",
        entityId: id,
        before,
      });
    });
    updateTag(tags.faqs);
    return { id };
  },
);
