import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { paymentPlanSteps, paymentPlans } from "@/db/schema/payment-plans";
import { projects } from "@/db/schema/projects";
import { properties } from "@/db/schema/properties";
import { liveStatuses } from "@/features/properties/status";
import { ActionError } from "@/lib/actions";
import { auditChange, writeAudit, type AuditActor } from "@/lib/audit";
import { isPlanComplete, type PaymentPlanInput, type PlanStep } from "./schema";

/** Server-side reads and writes for plans; owners (listings, projects) call these in their save. */

export type PlanRecord = {
  id: string;
  name: string;
  summaryLabel: string | null;
  notes: string | null;
  isTemplate: boolean;
  updatedAt: Date;
  steps: PlanStep[];
};

export async function loadPlans(db: DbOrTx, ids: string[]): Promise<Map<string, PlanRecord>> {
  const result = new Map<string, PlanRecord>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return result;
  const plans = await db
    .select()
    .from(paymentPlans)
    .where(and(eq(paymentPlans.agencyId, currentAgencyId()), inArray(paymentPlans.id, unique)));
  const steps = await db
    .select()
    .from(paymentPlanSteps)
    .where(inArray(paymentPlanSteps.paymentPlanId, unique))
    .orderBy(asc(paymentPlanSteps.paymentPlanId), asc(paymentPlanSteps.sortOrder));
  for (const p of plans) {
    result.set(p.id, {
      id: p.id,
      name: p.name,
      summaryLabel: p.summaryLabel,
      notes: p.notes,
      isTemplate: p.isTemplate,
      updatedAt: p.updatedAt,
      steps: [],
    });
  }
  for (const s of steps) {
    result.get(s.paymentPlanId)?.steps.push({
      id: s.id,
      stage: s.stage,
      label: s.label,
      percent: s.percent,
      timingText: s.timingText ?? "",
      dueDate: s.dueDate,
      instalmentsCount: s.instalmentsCount,
    });
  }
  return result;
}

export async function loadPlan(db: DbOrTx, id: string): Promise<PlanRecord | null> {
  return (await loadPlans(db, [id])).get(id) ?? null;
}

export async function listTemplates(db: DbOrTx): Promise<PlanRecord[]> {
  const rows = await db
    .select({ id: paymentPlans.id })
    .from(paymentPlans)
    .where(and(eq(paymentPlans.agencyId, currentAgencyId()), eq(paymentPlans.isTemplate, true)))
    .orderBy(desc(paymentPlans.updatedAt));
  const plans = await loadPlans(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => plans.get(r.id)!).filter(Boolean);
}

export function planInput(plan: PlanRecord): PaymentPlanInput {
  return {
    name: plan.name,
    summaryLabel: plan.summaryLabel ?? "",
    notes: plan.notes ?? "",
    steps: plan.steps,
  };
}

/** Where a plan is shown: projects and listings using it, and how many of those are live. */
export async function planUsage(
  db: DbOrTx,
  id: string,
): Promise<{ projects: number; listings: number; published: number }> {
  const [p] = await db
    .select({ n: count() })
    .from(projects)
    .where(and(eq(projects.paymentPlanId, id), isNull(projects.deletedAt)));
  const [pp] = await db
    .select({ n: count() })
    .from(projects)
    .where(
      and(
        eq(projects.paymentPlanId, id),
        isNull(projects.deletedAt),
        eq(projects.isPublished, true),
      ),
    );
  const [l] = await db
    .select({ n: count() })
    .from(properties)
    .where(and(eq(properties.paymentPlanId, id), isNull(properties.deletedAt)));
  const [lp] = await db
    .select({ n: count() })
    .from(properties)
    .where(
      and(
        eq(properties.paymentPlanId, id),
        isNull(properties.deletedAt),
        inArray(properties.status, [...liveStatuses]),
      ),
    );
  return {
    projects: Number(p?.n ?? 0),
    listings: Number(l?.n ?? 0),
    published: Number(pp?.n ?? 0) + Number(lp?.n ?? 0),
  };
}

const auditShape = (plan: Omit<PlanRecord, "id" | "updatedAt">) => ({
  name: plan.name,
  summaryLabel: plan.summaryLabel,
  notes: plan.notes,
  isTemplate: plan.isTemplate,
  steps: plan.steps.map(({ id: _id, ...s }) => s),
});

/**
 * Create or update a plan and its steps (replaced as a whole). A plan shown on something
 * published must keep adding up to 100% (05 §6).
 */
export async function writePlan(
  tx: Tx,
  args: {
    id: string | null;
    input: PaymentPlanInput;
    isTemplate: boolean;
    actor: AuditActor;
    userId: string | null;
  },
): Promise<string> {
  const { input, isTemplate } = args;
  const values = {
    name: input.name,
    summaryLabel: input.summaryLabel || null,
    notes: input.notes || null,
    isTemplate,
    updatedBy: args.userId,
  };
  let id = args.id;
  let before: PlanRecord | null = null;
  if (id) {
    before = await loadPlan(tx, id);
    if (!before || before.isTemplate !== isTemplate)
      throw new ActionError("This payment plan no longer exists.", "NOT_FOUND");
    if (!isPlanComplete(input.steps) && (await planUsage(tx, id)).published > 0)
      throw new ActionError(
        "This plan is shown on published listings or projects, so its steps must add up to 100%.",
        "PLAN_INCOMPLETE",
      );
    await tx.update(paymentPlans).set(values).where(eq(paymentPlans.id, id));
    await tx.delete(paymentPlanSteps).where(eq(paymentPlanSteps.paymentPlanId, id));
  } else {
    const [created] = await tx
      .insert(paymentPlans)
      .values({ ...values, createdBy: args.userId })
      .returning({ id: paymentPlans.id });
    id = created!.id;
  }
  await tx.insert(paymentPlanSteps).values(
    input.steps.map((s, i) => ({
      paymentPlanId: id!,
      sortOrder: i,
      stage: s.stage,
      label: s.label,
      percent: s.percent,
      timingText: s.timingText || null,
      dueDate: s.dueDate,
      instalmentsCount: s.instalmentsCount,
    })),
  );
  const after = auditShape({ ...values, steps: input.steps });
  if (before) {
    await auditChange(tx, {
      actor: args.actor,
      action: "payment_plan.update",
      entityType: "payment_plan",
      entityId: id,
      before: auditShape(before),
      after,
    });
  } else {
    await writeAudit(tx, {
      actor: args.actor,
      action: "payment_plan.create",
      entityType: "payment_plan",
      entityId: id,
      after,
    });
  }
  return id;
}

export async function deletePlan(tx: Tx, id: string, actor: AuditActor): Promise<void> {
  const before = await loadPlan(tx, id);
  if (!before) return;
  await tx.delete(paymentPlans).where(eq(paymentPlans.id, id));
  await writeAudit(tx, {
    actor,
    action: "payment_plan.delete",
    entityType: "payment_plan",
    entityId: id,
    before: auditShape(before),
  });
}
