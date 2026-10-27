import { z } from "zod";
import { paymentPlanStages } from "@/db/schema/payment-plans";

/** Payment plans (05 §6, 07 §5): steps whose percentages must add up to exactly 100. */

export type PlanStage = (typeof paymentPlanStages)[number];

export const stageLabels: Record<PlanStage, string> = {
  booking: "Booking",
  construction: "Construction",
  handover: "Handover",
  post_handover: "Post-handover",
};

/** Percent as basis points (12.5% -> 1250) so totals never drift with floating point. */
export const toBasisPoints = (percent: number): number => Math.round(percent * 100);

const percentSchema = z
  .number({ error: "Enter a percentage" })
  .gt(0, "Must be more than 0%")
  .max(100, "Cannot be more than 100%")
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Use at most two decimals");

export const planStepSchema = z
  .object({
    /** Client key for reordering; steps are stored fresh on every save. */
    id: z.string().min(1).max(64),
    stage: z.enum(paymentPlanStages),
    label: z.string().trim().min(1, "Name this step").max(80),
    percent: percentSchema,
    timingText: z.string().trim().max(120).default(""),
    dueDate: z.iso.date("Use a valid date").nullable().default(null),
    instalmentsCount: z
      .number()
      .int("Use a whole number")
      .min(2, "Leave empty for a single payment")
      .max(600)
      .nullable()
      .default(null),
  })
  .strict();

export type PlanStep = z.infer<typeof planStepSchema>;

export const paymentPlanInputSchema = z
  .object({
    name: z.string().trim().min(1, "Give the plan a name").max(80),
    /** Empty: the site shows the suggested label (e.g. "60/40"). */
    summaryLabel: z.string().trim().max(40).default(""),
    notes: z.string().trim().max(1000).default(""),
    steps: z.array(planStepSchema).min(1, "Add at least one step").max(30, "Use at most 30 steps"),
  })
  .strict();

export type PaymentPlanInput = z.infer<typeof paymentPlanInputSchema>;

export function planTotalBasisPoints(steps: ReadonlyArray<{ percent: number }>): number {
  return steps.reduce((sum, s) => sum + toBasisPoints(s.percent), 0);
}

export const isPlanComplete = (steps: ReadonlyArray<{ percent: number }>): boolean =>
  planTotalBasisPoints(steps) === 10_000;

/** "12.5" or "40": no trailing zeros. */
export const formatPercent = (basisPoints: number): string =>
  String(Number((basisPoints / 100).toFixed(2)));

/** What stops the plan from being shown on a published listing, or null. */
export function planProblem(steps: ReadonlyArray<{ percent: number }>): string | null {
  const total = planTotalBasisPoints(steps);
  if (steps.length === 0) return "Add at least one step.";
  if (total === 10_000) return null;
  return total < 10_000
    ? `The steps add up to ${formatPercent(total)}%. Add ${formatPercent(10_000 - total)}% to reach 100%.`
    : `The steps add up to ${formatPercent(total)}%. Remove ${formatPercent(total - 10_000)}% to get to 100%.`;
}

/**
 * The usual market shorthand: before handover / on handover ("60/40"), or before and on
 * handover / after it ("70/30 post-handover"). Empty when nothing is paid at or after handover.
 */
export function suggestSummaryLabel(
  steps: ReadonlyArray<{ stage: PlanStage; percent: number }>,
): string {
  const sum = (stages: PlanStage[]) =>
    steps.filter((s) => stages.includes(s.stage)).reduce((n, s) => n + toBasisPoints(s.percent), 0);
  const before = sum(["booking", "construction"]);
  const handover = sum(["handover"]);
  const after = sum(["post_handover"]);
  if (after > 0) return `${formatPercent(before + handover)}/${formatPercent(after)} post-handover`;
  if (handover > 0 && before > 0) return `${formatPercent(before)}/${formatPercent(handover)}`;
  return "";
}

/**
 * Amount per step for a price, in minor units. For a complete plan the amounts add up to the
 * price exactly (largest remainder goes first); BigInt keeps large prices exact.
 */
export function stepAmounts(price: number, steps: ReadonlyArray<{ percent: number }>): number[] {
  const p = BigInt(Math.round(price));
  const parts = steps.map((s) => {
    const scaled = p * BigInt(toBasisPoints(s.percent));
    return { whole: scaled / 10_000n, rest: scaled % 10_000n };
  });
  const amounts = parts.map((x) => x.whole);
  if (isPlanComplete(steps)) {
    let left = p - amounts.reduce((a, b) => a + b, 0n);
    const order = parts
      .map((x, i) => ({ i, rest: x.rest }))
      .sort((a, b) => (b.rest > a.rest ? 1 : b.rest < a.rest ? -1 : a.i - b.i));
    for (const { i } of order) {
      if (left <= 0n) break;
      amounts[i]! += 1n;
      left -= 1n;
    }
  }
  return amounts.map(Number);
}

export const newStepId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export function emptyPlan(): PaymentPlanInput {
  return {
    name: "",
    summaryLabel: "",
    notes: "",
    steps: [
      {
        id: newStepId(),
        stage: "booking",
        label: "Down payment",
        percent: 10,
        timingText: "",
        dueDate: null,
        instalmentsCount: null,
      },
    ],
  };
}
