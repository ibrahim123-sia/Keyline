import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { paymentPlanSteps, paymentPlans } from "@/db/schema/payment-plans";
import { properties } from "@/db/schema/properties";
import { auditLog } from "@/db/schema/system";
import { deletePlanTemplate, savePlanTemplate } from "@/features/payment-plans/actions";
import type { PaymentPlanInput } from "@/features/payment-plans/schema";
import { listTemplates, loadPlan, planUsage, writePlan } from "@/features/payment-plans/store";
import { builtInTemplates, planFromTemplate } from "@/features/payment-plans/templates";
import { newId } from "@/lib/ids";
import { adminState, testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("@/lib/auth/guards", () => import("../helpers/admin-guards-mock"));

const sixtyForty = () => planFromTemplate(builtInTemplates.find((t) => t.name === "60/40")!);
const actor = { type: "admin" as const, id: testAdmin.id };

async function auditFor(entityId: string) {
  const db = await getDb();
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityType, "payment_plan"), eq(auditLog.entityId, entityId)))
    .orderBy(asc(auditLog.createdAt));
}

describe("payment plan templates", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate("payment_plans", "payment_plan_steps", "properties", "audit_log");
  });

  it("saves a template with its steps in order and audits it", async () => {
    const res = await savePlanTemplate({ id: null, data: { ...sixtyForty(), name: "Our 60/40" } });
    expect(res.ok).toBe(true);
    const id = res.ok ? res.data.id : "";
    const plan = await loadPlan(await getDb(), id);
    expect(plan).toMatchObject({ name: "Our 60/40", summaryLabel: null, isTemplate: true });
    expect(plan!.steps.map((s) => [s.stage, s.percent])).toEqual([
      ["booking", 20],
      ["construction", 40],
      ["handover", 40],
    ]);
    const [entry] = await auditFor(id);
    expect(entry).toMatchObject({ action: "payment_plan.create", actorId: testAdmin.id });
    expect((entry!.after as { steps: unknown[] }).steps).toHaveLength(3);
  });

  it("replaces the steps on update and records what changed", async () => {
    const first = await savePlanTemplate({ id: null, data: sixtyForty() });
    const id = first.ok ? first.data.id : "";
    const db = await getDb();
    const before = (await loadPlan(db, id))!;
    const edited: PaymentPlanInput = {
      ...sixtyForty(),
      name: "60/40 with notes",
      notes: "Registration fees are due on booking.",
      steps: [
        { ...before.steps[0]!, percent: 10 },
        { ...before.steps[1]!, percent: 50, instalmentsCount: 8 },
        before.steps[2]!,
      ],
    };
    expect(await savePlanTemplate({ id, data: edited })).toMatchObject({ ok: true });
    const rows = await db
      .select()
      .from(paymentPlanSteps)
      .where(eq(paymentPlanSteps.paymentPlanId, id))
      .orderBy(asc(paymentPlanSteps.sortOrder));
    expect(rows.map((r) => [r.percent, r.instalmentsCount])).toEqual([
      [10, null],
      [50, 8],
      [40, null],
    ]);
    const entries = await auditFor(id);
    expect(entries.map((e) => e.action)).toEqual(["payment_plan.create", "payment_plan.update"]);
    expect(entries[1]!.after).toMatchObject({
      name: "60/40 with notes",
      notes: "Registration fees are due on booking.",
    });
  });

  it("refuses a template that does not add up to 100%", async () => {
    const plan = sixtyForty();
    plan.steps[2]!.percent = 30;
    const res = await savePlanTemplate({ id: null, data: plan });
    expect(res).toMatchObject({
      ok: false,
      code: "PLAN_INCOMPLETE",
      fieldErrors: { steps: ["The steps add up to 90%. Add 10% to reach 100%."] },
    });
    const db = await getDb();
    expect(await db.select().from(paymentPlans)).toHaveLength(0);
  });

  it("deletes templates only, never plans that belong to a listing", async () => {
    const db = await getDb();
    const template = await savePlanTemplate({ id: null, data: sixtyForty() });
    const templateId = template.ok ? template.data.id : "";
    const owned = await db.transaction((tx) =>
      writePlan(tx, {
        id: null,
        input: sixtyForty(),
        isTemplate: false,
        actor,
        userId: testAdmin.id,
      }),
    );
    expect(await deletePlanTemplate({ id: owned })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await deletePlanTemplate({ id: templateId })).toMatchObject({ ok: true });
    expect((await listTemplates(db)).map((t) => t.id)).toEqual([]);
    expect(await loadPlan(db, owned)).not.toBeNull();
    expect((await auditFor(templateId)).map((e) => e.action)).toEqual([
      "payment_plan.create",
      "payment_plan.delete",
    ]);
  });

  it("read-only admins cannot change templates", async () => {
    adminState.user = { ...testAdmin, readOnly: true };
    expect(await savePlanTemplate({ id: null, data: sixtyForty() })).toMatchObject({
      ok: false,
      code: "READ_ONLY",
    });
  });
});

describe("plans on listings", () => {
  beforeEach(async () => {
    adminState.user = testAdmin;
    await truncate("payment_plans", "payment_plan_steps", "properties", "audit_log");
  });

  async function listingWithPlan(status: "draft" | "available") {
    const db = await getDb();
    const planId = await db.transaction((tx) =>
      writePlan(tx, { id: null, input: sixtyForty(), isTemplate: false, actor, userId: null }),
    );
    await db.insert(properties).values({
      id: newId(),
      reference: `LT-${Math.floor(Math.random() * 1e6)}`,
      title: "Canal view apartment",
      slug: `canal-view-${newId().slice(0, 8)}`,
      purpose: "sale",
      status,
      paymentPlanId: planId,
    });
    return { db, planId };
  }

  it("a plan on a live listing must keep adding up to 100%", async () => {
    const { db, planId } = await listingWithPlan("available");
    expect(await planUsage(db, planId)).toEqual({ projects: 0, listings: 1, published: 1 });
    const broken = sixtyForty();
    broken.steps.pop();
    await expect(
      db.transaction((tx) =>
        writePlan(tx, { id: planId, input: broken, isTemplate: false, actor, userId: null }),
      ),
    ).rejects.toMatchObject({ code: "PLAN_INCOMPLETE" });
    expect((await loadPlan(db, planId))!.steps).toHaveLength(3);
  });

  it("a draft listing can hold an unfinished plan", async () => {
    const { db, planId } = await listingWithPlan("draft");
    expect((await planUsage(db, planId)).published).toBe(0);
    const unfinished = sixtyForty();
    unfinished.steps.pop();
    await db.transaction((tx) =>
      writePlan(tx, { id: planId, input: unfinished, isTemplate: false, actor, userId: null }),
    );
    expect((await loadPlan(db, planId))!.steps).toHaveLength(2);
  });

  it("a template id cannot be written as a listing's own plan", async () => {
    const db = await getDb();
    const template = await savePlanTemplate({ id: null, data: sixtyForty() });
    const templateId = template.ok ? template.data.id : "";
    await expect(
      db.transaction((tx) =>
        writePlan(tx, {
          id: templateId,
          input: sixtyForty(),
          isTemplate: false,
          actor,
          userId: null,
        }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
