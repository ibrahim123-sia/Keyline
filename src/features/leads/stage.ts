import "server-only";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { leadEvents, leads, leadTasks } from "@/db/schema/crm";
import { leadStages } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { ActionError } from "@/lib/actions";
import { writeAudit, type AuditActor } from "@/lib/audit";

/** Who did it, as the timeline stores it. */
export const timelineActor = (actor: AuditActor) => ({
  actorType:
    actor.type === "admin"
      ? ("admin" as const)
      : actor.type === "ai"
        ? ("ai" as const)
        : ("system" as const),
  actorId: actor.id,
});

async function loadLead(tx: DbOrTx, leadId: string) {
  const [lead] = await tx
    .select({
      id: leads.id,
      stageId: leads.stageId,
      status: leads.status,
      agentId: leads.agentId,
      tags: leads.tags,
      type: leads.type,
    })
    .from(leads)
    .where(
      and(eq(leads.id, leadId), eq(leads.agencyId, currentAgencyId()), isNull(leads.mergedIntoId)),
    );
  if (!lead) throw new ActionError("This lead no longer exists.", "NOT_FOUND");
  return lead;
}

/**
 * Moves a lead to a stage (09 §4): its status follows the stage's kind; Lost needs a reason
 * (Settings -> Leads) and Won a deal value, which are kept on the lead. Writes the timeline
 * and the audit. Returns false when it was already there.
 */
export async function applyLeadStage(
  tx: DbOrTx,
  input: {
    leadId: string;
    stageId: string;
    lostReason?: string | null;
    /** Minor units of `dealCurrency` (the base currency). */
    dealValue?: number | null;
    dealCurrency?: string | null;
    actor: AuditActor;
    now: Date;
  },
): Promise<boolean> {
  const lead = await loadLead(tx, input.leadId);
  const [stage] = await tx
    .select()
    .from(leadStages)
    .where(and(eq(leadStages.id, input.stageId), eq(leadStages.agencyId, currentAgencyId())));
  if (!stage) throw new ActionError("This stage no longer exists.", "NOT_FOUND");
  if (lead.stageId === stage.id) return false;
  const lostReason = input.lostReason?.trim() || null;
  if (stage.kind === "lost" && !lostReason)
    throw new ActionError("Choose why the lead was lost.", "VALIDATION", {
      lostReason: ["Choose a reason"],
    });
  if (stage.kind === "won" && (input.dealValue === null || input.dealValue === undefined))
    throw new ActionError("Enter the deal value.", "VALIDATION", {
      dealValue: ["Enter the deal value"],
    });
  const [from] = lead.stageId
    ? await tx
        .select({ id: leadStages.id, name: leadStages.name })
        .from(leadStages)
        .where(eq(leadStages.id, lead.stageId))
    : [];
  await tx
    .update(leads)
    .set({
      stageId: stage.id,
      status: stage.kind,
      wonAt: stage.kind === "won" ? input.now : null,
      lostAt: stage.kind === "lost" ? input.now : null,
      lostReason: stage.kind === "lost" ? lostReason : null,
      ...(stage.kind === "won"
        ? { dealValue: input.dealValue!, dealCurrency: input.dealCurrency ?? null }
        : {}),
      lastActivityAt: input.now,
      updatedBy: input.actor.id,
    })
    .where(eq(leads.id, lead.id));
  await tx.insert(leadEvents).values({
    leadId: lead.id,
    type: "stage_changed",
    meta: {
      from: from ? { id: from.id, name: from.name } : null,
      to: { id: stage.id, name: stage.name },
      kind: stage.kind,
      ...(stage.kind === "lost" ? { lostReason } : {}),
      ...(stage.kind === "won"
        ? { dealValue: input.dealValue, dealCurrency: input.dealCurrency }
        : {}),
    },
    ...timelineActor(input.actor),
    createdAt: input.now,
  });
  await writeAudit(tx, {
    actor: input.actor,
    action: "lead.stage",
    entityType: "lead",
    entityId: lead.id,
    before: { stageId: lead.stageId, status: lead.status },
    after: {
      stageId: stage.id,
      status: stage.kind,
      ...(lostReason && stage.kind === "lost" ? { lostReason } : {}),
      ...(stage.kind === "won" ? { dealValue: input.dealValue } : {}),
    },
  });
  return true;
}

/** Gives the lead (and its open tasks of the previous agent) to an agent, or to nobody. */
export async function applyLeadAgent(
  tx: DbOrTx,
  input: { leadId: string; agentId: string | null; actor: AuditActor; now: Date },
): Promise<boolean> {
  const lead = await loadLead(tx, input.leadId);
  if (lead.agentId === input.agentId) return false;
  let agentName: string | null = null;
  if (input.agentId) {
    const [agent] = await tx
      .select({ name: agents.name, isActive: agents.isActive })
      .from(agents)
      .where(and(eq(agents.id, input.agentId), eq(agents.agencyId, currentAgencyId())));
    if (!agent?.isActive) throw new ActionError("Choose an active agent profile.", "VALIDATION");
    agentName = agent.name;
  }
  await tx
    .update(leads)
    .set({ agentId: input.agentId, lastActivityAt: input.now, updatedBy: input.actor.id })
    .where(eq(leads.id, lead.id));
  await tx
    .update(leadTasks)
    .set({ agentId: input.agentId })
    .where(
      and(
        eq(leadTasks.leadId, lead.id),
        isNull(leadTasks.doneAt),
        lead.agentId
          ? or(isNull(leadTasks.agentId), eq(leadTasks.agentId, lead.agentId))
          : isNull(leadTasks.agentId),
      ),
    );
  await tx.insert(leadEvents).values({
    leadId: lead.id,
    type: "assigned",
    meta: { agentId: input.agentId, agentName, by: "admin" },
    ...timelineActor(input.actor),
    createdAt: input.now,
  });
  await writeAudit(tx, {
    actor: input.actor,
    action: "lead.assign",
    entityType: "lead",
    entityId: lead.id,
    before: { agentId: lead.agentId },
    after: { agentId: input.agentId },
  });
  return true;
}

/** Adds or removes one tag (kept lowercase-insensitive unique). */
export async function applyLeadTag(
  tx: DbOrTx,
  input: { leadId: string; tag: string; add: boolean; actor: AuditActor },
): Promise<boolean> {
  const lead = await loadLead(tx, input.leadId);
  const tag = input.tag.trim();
  const has = lead.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
  if (input.add === has) return false;
  const tags = input.add
    ? [...lead.tags, tag]
    : lead.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase());
  await tx.update(leads).set({ tags, updatedBy: input.actor.id }).where(eq(leads.id, lead.id));
  await writeAudit(tx, {
    actor: input.actor,
    action: input.add ? "lead.tag" : "lead.untag",
    entityType: "lead",
    entityId: lead.id,
    before: { tags: lead.tags },
    after: { tags },
  });
  return true;
}

/** Keeps `next_task_at` equal to the earliest open task's due time. */
export async function refreshNextTask(tx: DbOrTx, leadId: string): Promise<void> {
  await tx.execute(sql`
    update leads set next_task_at = (
      select min(due_at) from lead_tasks where lead_id = ${leadId} and done_at is null
    ) where id = ${leadId}`);
}
