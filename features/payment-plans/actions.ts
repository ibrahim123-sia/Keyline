"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { ActionError, adminAction } from "@/lib/actions";
import { paymentPlanInputSchema, planProblem } from "./schema";
import { deletePlan, loadPlan, writePlan } from "./store";

/** Setup -> Payment plans: the agency's own templates (07 §5). They must add up to 100%. */
export const savePlanTemplate = adminAction(
  z.object({ id: z.uuid().nullable(), data: paymentPlanInputSchema }),
  { write: true },
  async ({ id, data }, ctx) => {
    const problem = planProblem(data.steps);
    if (problem)
      throw new ActionError(`Templates must add up to 100%. ${problem}`, "PLAN_INCOMPLETE", {
        steps: [problem],
      });
    const db = await getDb();
    const saved = await db.transaction((tx) =>
      writePlan(tx, { id, input: data, isTemplate: true, actor: ctx.actor, userId: ctx.user.id }),
    );
    return { id: saved };
  },
);

export const deletePlanTemplate = adminAction(
  z.object({ id: z.uuid() }),
  { write: true },
  async ({ id }, ctx) => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      const plan = await loadPlan(tx, id);
      // Plans attached to listings or projects are removed with them, never from here.
      if (!plan?.isTemplate) throw new ActionError("This template no longer exists.", "NOT_FOUND");
      await deletePlan(tx, id, ctx.actor);
    });
    return { id };
  },
);
