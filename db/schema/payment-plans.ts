import { boolean, date, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { agencyColumn, baseColumns, idColumn, numericNumber, timestamps } from "./_common";

export const paymentPlanStages = ["booking", "construction", "handover", "post_handover"] as const;
export type PaymentPlanStage = (typeof paymentPlanStages)[number];

/**
 * Payment plans (05 §6, 07 §5): attached to a project (inherited by its units) or to a
 * listing. `is_template` marks the agency's own reusable templates in the builder.
 */
export const paymentPlans = pgTable("payment_plans", {
  ...baseColumns(),
  name: text().notNull(),
  /** Short label for cards and filters, e.g. "60/40" or "70/30 post-handover". */
  summaryLabel: text(),
  notes: text(),
  isTemplate: boolean().notNull().default(false),
});

export const paymentPlanSteps = pgTable(
  "payment_plan_steps",
  {
    id: idColumn(),
    agencyId: agencyColumn(),
    paymentPlanId: uuid()
      .notNull()
      .references(() => paymentPlans.id, { onDelete: "cascade" }),
    sortOrder: integer().notNull().default(0),
    stage: text({ enum: paymentPlanStages }).notNull(),
    label: text().notNull(),
    /** Percent of the price (0-100, up to 2 decimals). All steps together must be exactly 100. */
    percent: numericNumber().notNull(),
    /** e.g. "In 8 instalments to 2027", "Monthly over 24 months". */
    timingText: text(),
    dueDate: date(),
    instalmentsCount: integer(),
    ...timestamps(),
  },
  (t) => [index("payment_plan_steps_plan_idx").on(t.paymentPlanId, t.sortOrder)],
);
