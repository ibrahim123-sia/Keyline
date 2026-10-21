"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { leads } from "@/db/schema/crm";
import { loadSettings } from "@/features/settings/queries";
import { ActionError, adminAction } from "@/lib/actions";
import { writeAudit } from "@/lib/audit";
import { toMinor } from "@/lib/money";
import { applyLeadAgent, applyLeadStage, applyLeadTag } from "./stage";

const stageMove = {
  stageId: z.uuid(),
  lostReason: z.string().trim().max(120).nullable().default(null),
  /** Major units of the base currency. */
  dealValue: z.number().min(0).max(1e13).nullable().default(null),
};

/** Base-currency minor units for a deal value typed in major units. */
async function dealMinor(db: Awaited<ReturnType<typeof getDb>>, major: number | null) {
  if (major === null) return { dealValue: null, dealCurrency: null };
  const market = await loadSettings("market", db);
  return {
    dealValue: toMinor(major, market.baseCurrency.decimals),
    dealCurrency: market.baseCurrency.code,
  };
}

/** Lead page stage selector, Kanban drag and "mark won / lost" (09 §4). */
export const changeLeadStage = adminAction(
  z.object({ id: z.uuid(), ...stageMove }).strict(),
  { write: true },
  async ({ id, stageId, lostReason, dealValue }, ctx) => {
    const db = await getDb();
    const deal = await dealMinor(db, dealValue);
    const changed = await db.transaction((tx) =>
      applyLeadStage(tx, {
        leadId: id,
        stageId,
        lostReason,
        ...deal,
        actor: ctx.actor,
        now: new Date(),
      }),
    );
    return { id, changed };
  },
);

export const assignLead = adminAction(
  z.object({ id: z.uuid(), agentId: z.uuid().nullable() }).strict(),
  { write: true },
  async ({ id, agentId }, ctx) => {
    const db = await getDb();
    const changed = await db.transaction((tx) =>
      applyLeadAgent(tx, { leadId: id, agentId, actor: ctx.actor, now: new Date() }),
    );
    return { id, changed };
  },
);

export const setLeadType = adminAction(
  z.object({ id: z.uuid(), type: z.string().trim().min(1).max(30) }).strict(),
  { write: true },
  async ({ id, type }, ctx) => {
    const db = await getDb();
    const { leadTypes } = await loadSettings("leads", db);
    if (!leadTypes.includes(type))
      throw new ActionError("Choose one of the lead types in Settings -> Leads.", "VALIDATION");
    await db.transaction(async (tx) => {
      const [lead] = await tx
        .select({ type: leads.type })
        .from(leads)
        .where(
          and(eq(leads.id, id), eq(leads.agencyId, currentAgencyId()), isNull(leads.mergedIntoId)),
        );
      if (!lead) throw new ActionError("This lead no longer exists.", "NOT_FOUND");
      if (lead.type === type) return;
      await tx.update(leads).set({ type, updatedBy: ctx.user.id }).where(eq(leads.id, id));
      await writeAudit(tx, {
        actor: ctx.actor,
        action: "lead.type",
        entityType: "lead",
        entityId: id,
        before: { type: lead.type },
        after: { type },
      });
    });
    return { id };
  },
);

export const setLeadTag = adminAction(
  z.object({ id: z.uuid(), tag: z.string().trim().min(1).max(40), add: z.boolean() }).strict(),
  { write: true },
  async ({ id, tag, add }, ctx) => {
    const db = await getDb();
    const changed = await db.transaction((tx) =>
      applyLeadTag(tx, { leadId: id, tag, add, actor: ctx.actor }),
    );
    return { id, changed };
  },
);

const bulkAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("assign"), agentId: z.uuid().nullable() }),
  z.object({ type: z.literal("stage"), ...stageMove }),
  z.object({ type: z.literal("tag"), tag: z.string().trim().min(1).max(40) }),
]);

export type LeadBulkResult = { updated: number; skipped: Array<{ id: string; reason: string }> };

/** Bulk assign, change stage or add a tag (09 §4); merge is its own action. */
export const bulkUpdateLeads = adminAction(
  z.object({ ids: z.array(z.uuid()).min(1).max(500), action: bulkAction }).strict(),
  { write: true },
  async ({ ids, action }, ctx) => {
    const db = await getDb();
    const now = new Date();
    const deal = action.type === "stage" ? await dealMinor(db, action.dealValue) : null;
    const result: LeadBulkResult = { updated: 0, skipped: [] };
    await db.transaction(async (tx) => {
      const found = await tx
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            inArray(leads.id, ids),
            eq(leads.agencyId, currentAgencyId()),
            isNull(leads.mergedIntoId),
          ),
        );
      const known = new Set(found.map((r) => r.id));
      for (const id of ids) {
        if (!known.has(id)) {
          result.skipped.push({ id, reason: "No longer exists" });
          continue;
        }
        const changed =
          action.type === "assign"
            ? await applyLeadAgent(tx, {
                leadId: id,
                agentId: action.agentId,
                actor: ctx.actor,
                now,
              })
            : action.type === "stage"
              ? await applyLeadStage(tx, {
                  leadId: id,
                  stageId: action.stageId,
                  lostReason: action.lostReason,
                  ...deal!,
                  actor: ctx.actor,
                  now,
                })
              : await applyLeadTag(tx, {
                  leadId: id,
                  tag: action.tag,
                  add: true,
                  actor: ctx.actor,
                });
        if (changed) result.updated++;
        else result.skipped.push({ id, reason: "Already like that" });
      }
    });
    return result;
  },
);
