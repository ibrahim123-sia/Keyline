import { newStepId, type PaymentPlanInput, type PlanStep } from "./schema";

type TemplateStep = Omit<PlanStep, "id" | "timingText" | "dueDate" | "instalmentsCount"> &
  Partial<Pick<PlanStep, "timingText" | "instalmentsCount">>;

export type PlanTemplate = {
  /** "builtin:60-40" for the ones below, the plan id for the agency's own. */
  key: string;
  name: string;
  summaryLabel: string;
  builtIn: boolean;
  steps: TemplateStep[];
};

/**
 * Starting points from 07 §5. The admin edits the copy; they never change these. Saved
 * agency templates are payment_plans rows with is_template = true. An empty label follows
 * the steps ("60/40" until the steps change); only "1% monthly" needs its own.
 */
export const builtInTemplates: PlanTemplate[] = [
  {
    key: "builtin:10-50-20-20",
    name: "10/50/20/20",
    summaryLabel: "",
    builtIn: true,
    steps: [
      { stage: "booking", label: "Down payment", percent: 10, timingText: "On booking" },
      {
        stage: "construction",
        label: "During construction",
        percent: 50,
        timingText: "In instalments as construction progresses",
      },
      { stage: "handover", label: "On handover", percent: 20, timingText: "On completion" },
      {
        stage: "post_handover",
        label: "After handover",
        percent: 20,
        timingText: "Over 2 years after handover",
      },
    ],
  },
  {
    key: "builtin:60-40",
    name: "60/40",
    summaryLabel: "",
    builtIn: true,
    steps: [
      { stage: "booking", label: "Down payment", percent: 20, timingText: "On booking" },
      {
        stage: "construction",
        label: "During construction",
        percent: 40,
        timingText: "In instalments as construction progresses",
      },
      { stage: "handover", label: "On handover", percent: 40, timingText: "On completion" },
    ],
  },
  {
    key: "builtin:70-30-post",
    name: "70/30 post-handover",
    summaryLabel: "",
    builtIn: true,
    steps: [
      { stage: "booking", label: "Down payment", percent: 20, timingText: "On booking" },
      {
        stage: "construction",
        label: "During construction",
        percent: 40,
        timingText: "In instalments as construction progresses",
      },
      { stage: "handover", label: "On handover", percent: 10, timingText: "On completion" },
      {
        stage: "post_handover",
        label: "After handover",
        percent: 30,
        timingText: "Monthly over 3 years after handover",
        instalmentsCount: 36,
      },
    ],
  },
  {
    key: "builtin:1-monthly",
    name: "1% monthly",
    summaryLabel: "1% monthly",
    builtIn: true,
    steps: [
      { stage: "booking", label: "Down payment", percent: 10, timingText: "On booking" },
      {
        stage: "construction",
        label: "Monthly payments",
        percent: 60,
        timingText: "1% every month",
        instalmentsCount: 60,
      },
      { stage: "handover", label: "On handover", percent: 30, timingText: "On completion" },
    ],
  },
];

/** A fresh, editable plan from a template (new step ids each time). */
export function planFromTemplate(t: PlanTemplate): PaymentPlanInput {
  return {
    name: t.name,
    summaryLabel: t.summaryLabel,
    notes: "",
    steps: t.steps.map((s) => ({
      id: newStepId(),
      stage: s.stage,
      label: s.label,
      percent: s.percent,
      timingText: s.timingText ?? "",
      dueDate: null,
      instalmentsCount: s.instalmentsCount ?? null,
    })),
  };
}
