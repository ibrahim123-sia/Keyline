"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { savedViews } from "@/db/schema/saved-views";
import { ActionError, adminAction } from "@/lib/actions";
import { writeAudit } from "@/lib/audit";
import { saveViewSchema } from "./schema";

/** Saves the table's current filters under a name (replacing a view with the same name). */
export const saveView = adminAction(saveViewSchema, { write: true }, async (input, ctx) => {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(savedViews)
      .values({ ...input, createdBy: ctx.user.id, updatedBy: ctx.user.id })
      .onConflictDoUpdate({
        target: [savedViews.agencyId, savedViews.tableId, savedViews.name],
        set: { query: input.query, updatedBy: ctx.user.id },
      })
      .returning();
    await writeAudit(tx, {
      actor: ctx.actor,
      action: "saved_view.save",
      entityType: "saved_view",
      entityId: row!.id,
      after: { tableId: row!.tableId, name: row!.name, query: row!.query },
    });
    return { id: row!.id, name: row!.name, query: row!.query };
  });
});

export const deleteView = adminAction(
  z.object({ id: z.uuid() }),
  { write: true },
  async ({ id }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const [row] = await tx
        .delete(savedViews)
        .where(and(eq(savedViews.id, id), eq(savedViews.agencyId, currentAgencyId())))
        .returning();
      if (!row) throw new ActionError("This view no longer exists.", "NOT_FOUND");
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "saved_view.delete",
        entityType: "saved_view",
        entityId: id,
        before: { tableId: row.tableId, name: row.name, query: row.query },
      });
    });
    return { id };
  },
);
