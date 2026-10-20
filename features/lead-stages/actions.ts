"use server";

import { and, eq, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { getDb, type Tx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { leadStages } from "@/db/schema/master-data";
import { ActionError, adminAction } from "@/lib/actions";
import { auditChange, writeAudit } from "@/lib/audit";
import { tags } from "@/lib/cache-tags";
import { describeUsage } from "@/lib/usage-registry";
import { defaultLeadStages, leadStageInputSchema, pipelineProblem } from "./schema";
import { leadStageRefs, leadStageUsage } from "./usage";

async function stages(tx: Tx) {
  return tx
    .select()
    .from(leadStages)
    .where(eq(leadStages.agencyId, currentAgencyId()))
    .orderBy(leadStages.sortOrder);
}

type Kind = "open" | "won" | "lost";

/** Refuse a change that would break a complete pipeline (one still being built is fine). */
function assertStillComplete(before: Kind[], after: Kind[]) {
  const problem = pipelineProblem(after);
  if (problem && !pipelineProblem(before)) throw new ActionError(problem, "PIPELINE");
}

export const saveLeadStage = adminAction(
  z.object({ id: z.uuid().nullable(), data: leadStageInputSchema }),
  { write: true },
  async ({ id, data }, ctx) => {
    const db = await getDb();
    const saved = await db.transaction(async (tx) => {
      const all = await stages(tx);
      if (all.some((s) => s.id !== id && s.name.toLowerCase() === data.name.toLowerCase())) {
        throw new ActionError("There is already a stage with this name.", "VALIDATION", {
          name: ["There is already a stage with this name."],
        });
      }
      if (id) {
        const before = all.find((s) => s.id === id);
        if (!before) throw new ActionError("This stage no longer exists.", "NOT_FOUND");
        // Changing a kind must not leave the pipeline without an open, won or lost stage.
        assertStillComplete(
          all.map((s) => s.kind),
          all.map((s) => (s.id === id ? data.kind : s.kind)),
        );
        const [after] = await tx
          .update(leadStages)
          .set({ ...data, updatedBy: ctx.user.id })
          .where(eq(leadStages.id, id))
          .returning();
        await auditChange(tx, {
          actor: ctx.actor,
          action: "lead_stage.update",
          entityType: "lead_stage",
          entityId: id,
          before,
          after,
        });
        return after!;
      }
      const [created] = await tx
        .insert(leadStages)
        .values({
          ...data,
          sortOrder: all.length ? Math.max(...all.map((s) => s.sortOrder)) + 1 : 0,
          createdBy: ctx.user.id,
          updatedBy: ctx.user.id,
        })
        .returning();
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "lead_stage.create",
        entityType: "lead_stage",
        entityId: created!.id,
        after: created,
      });
      return created!;
    });
    updateTag(tags.leadStages);
    return { id: saved.id };
  },
);

export const reorderLeadStages = adminAction(
  z.object({ ids: z.array(z.uuid()).min(1).max(50) }),
  { write: true },
  async ({ ids }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      for (const [index, id] of ids.entries()) {
        await tx
          .update(leadStages)
          .set({ sortOrder: index })
          .where(and(eq(leadStages.id, id), eq(leadStages.agencyId, currentAgencyId())));
      }
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "lead_stage.reorder",
        entityType: "lead_stage",
        after: { order: ids },
      });
    });
    updateTag(tags.leadStages);
    return { count: ids.length };
  },
);

/**
 * Deletes a stage. Leads in it move to `moveTo` first (required when the stage is in use),
 * and the pipeline always keeps an open, a won and a lost stage.
 */
export const deleteLeadStage = adminAction(
  z.object({ id: z.uuid(), moveTo: z.uuid().nullable() }),
  { write: true },
  async ({ id, moveTo }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const all = await stages(tx);
      const stage = all.find((s) => s.id === id);
      if (!stage) throw new ActionError("This stage no longer exists.", "NOT_FOUND");
      assertStillComplete(
        all.map((s) => s.kind),
        all.filter((s) => s.id !== id).map((s) => s.kind),
      );
      const usage = (await leadStageUsage(tx, [id])).get(id)!;
      if (usage.total > 0) {
        const target = all.find((s) => s.id === moveTo && s.id !== id);
        if (!target) {
          throw new ActionError(
            `${describeUsage(usage)} are in this stage. Choose a stage to move them to.`,
            "IN_USE",
          );
        }
        for (const ref of leadStageRefs()) {
          if (!ref.merge) throw new Error(`Lead stage usage "${ref.label}" has no merge`);
          await ref.merge(tx, id, target.id);
        }
      }
      await tx.delete(leadStages).where(eq(leadStages.id, id));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "lead_stage.delete",
        entityType: "lead_stage",
        entityId: id,
        before: stage,
        after: usage.total > 0 ? { movedTo: moveTo, moved: usage.parts } : undefined,
      });
    });
    updateTag(tags.leadStages);
    return { id };
  },
);

/** Fills an empty pipeline with the default stages (fresh installs). */
export const createDefaultLeadStages = adminAction(
  z.object({}).strict(),
  { write: true },
  async (_, ctx) => {
    const db = await getDb();
    const created = await db.transaction(async (tx) => {
      const [{ n }] = (await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(leadStages)
        .where(eq(leadStages.agencyId, currentAgencyId()))) as [{ n: number }];
      if (n > 0) throw new ActionError("The pipeline already has stages.", "VALIDATION");
      const rows = await tx
        .insert(leadStages)
        .values(
          defaultLeadStages.map((s, i) => ({
            ...s,
            sortOrder: i,
            createdBy: ctx.user.id,
            updatedBy: ctx.user.id,
          })),
        )
        .returning({ id: leadStages.id });
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "lead_stage.create_defaults",
        entityType: "lead_stage",
        after: { stages: defaultLeadStages.map((s) => s.name) },
      });
      return rows.length;
    });
    updateTag(tags.leadStages);
    return { count: created };
  },
);
