import { describe, expect, it } from "vitest";
import {
  isPlanComplete,
  paymentPlanInputSchema,
  planProblem,
  planTotalBasisPoints,
  stepAmounts,
  suggestSummaryLabel,
  type PlanStage,
} from "@/features/payment-plans/schema";
import { builtInTemplates, planFromTemplate } from "@/features/payment-plans/templates";
import { formatMoney, toMinor } from "@/lib/money";

const steps = (...parts: Array<[PlanStage, number]>) =>
  parts.map(([stage, percent]) => ({ stage, percent }));

const step = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  stage: "booking",
  label: "Down payment",
  percent: 100,
  ...over,
});

describe("payment plan totals", () => {
  it("adds percentages exactly, even with decimals", () => {
    const thirds = steps(["booking", 33.33], ["construction", 33.33], ["handover", 33.34]);
    expect(planTotalBasisPoints(thirds)).toBe(10_000);
    expect(isPlanComplete(thirds)).toBe(true);
    expect(isPlanComplete(steps(["booking", 0.1], ["handover", 0.2], ["handover", 99.7]))).toBe(
      true,
    );
  });

  it("says how far off an incomplete plan is", () => {
    expect(planProblem(steps(["booking", 20], ["handover", 70]))).toBe(
      "The steps add up to 90%. Add 10% to reach 100%.",
    );
    expect(planProblem(steps(["booking", 20], ["handover", 82.5]))).toBe(
      "The steps add up to 102.5%. Remove 2.5% to get to 100%.",
    );
    expect(planProblem([])).toBe("Add at least one step.");
    expect(planProblem(steps(["booking", 100]))).toBeNull();
  });

  it("suggests the market shorthand label", () => {
    expect(
      suggestSummaryLabel(steps(["booking", 20], ["construction", 40], ["handover", 40])),
    ).toBe("60/40");
    expect(
      suggestSummaryLabel(
        steps(["booking", 20], ["construction", 40], ["handover", 10], ["post_handover", 30]),
      ),
    ).toBe("70/30 post-handover");
    expect(suggestSummaryLabel(steps(["booking", 10], ["construction", 90]))).toBe("");
    expect(suggestSummaryLabel(steps(["handover", 100]))).toBe("");
  });
});

describe("amounts per step", () => {
  it("adds up to the price exactly for a complete plan", () => {
    const plan = steps(["booking", 33.33], ["construction", 33.33], ["handover", 33.34]);
    const amounts = stepAmounts(1_234_567, plan);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(1_234_567);
    expect(amounts).toEqual([411_481, 411_481, 411_605]);
  });

  it("stays exact for very large prices", () => {
    const price = 987_654_321_098_765; // above 2^53 / 10_000
    const amounts = stepAmounts(price, steps(["booking", 12.5], ["handover", 87.5]));
    expect(amounts).toEqual([123_456_790_137_346, 864_197_530_961_419]);
    expect(BigInt(amounts[0]!) + BigInt(amounts[1]!)).toBe(BigInt(price));
  });

  it("does not top up an incomplete plan", () => {
    expect(stepAmounts(1_000_000, steps(["booking", 10], ["handover", 50]))).toEqual([
      100_000, 500_000,
    ]);
  });
});

describe("payment plan input", () => {
  const plan = (s: unknown[]) => ({ name: "Plan", steps: s });

  it("fills defaults", () => {
    expect(paymentPlanInputSchema.parse(plan([step()]))).toEqual({
      name: "Plan",
      summaryLabel: "",
      notes: "",
      steps: [
        {
          id: "s1",
          stage: "booking",
          label: "Down payment",
          percent: 100,
          timingText: "",
          dueDate: null,
          instalmentsCount: null,
        },
      ],
    });
  });

  it.each([
    ["three decimals", { percent: 12.345 }, "Use at most two decimals"],
    ["zero", { percent: 0 }, "Must be more than 0%"],
    ["over 100", { percent: 100.5 }, "Cannot be more than 100%"],
    ["one instalment", { instalmentsCount: 1 }, "Leave empty for a single payment"],
    ["a bad date", { dueDate: "2027-02-30" }, "Use a valid date"],
    ["no name", { label: "  " }, "Name this step"],
    ["an unknown stage", { stage: "signing" }, undefined],
  ])("refuses a step with %s", (_, over, message) => {
    const res = paymentPlanInputSchema.safeParse(plan([step(over)]));
    expect(res.success).toBe(false);
    if (message) expect(res.error!.issues[0]!.message).toBe(message);
  });

  it("needs 1 to 30 steps", () => {
    expect(paymentPlanInputSchema.safeParse(plan([])).error!.issues[0]!.message).toBe(
      "Add at least one step",
    );
    const many = Array.from({ length: 31 }, (_, i) => step({ id: `s${i}`, percent: 1 }));
    expect(paymentPlanInputSchema.safeParse(plan(many)).success).toBe(false);
  });

  it("built-in templates are valid and add up to 100%", () => {
    expect(builtInTemplates.map((t) => t.name)).toEqual([
      "10/50/20/20",
      "60/40",
      "70/30 post-handover",
      "1% monthly",
    ]);
    for (const t of builtInTemplates) {
      const input = paymentPlanInputSchema.parse(planFromTemplate(t));
      expect(isPlanComplete(input.steps), t.name).toBe(true);
      expect(new Set(input.steps.map((s) => s.id)).size).toBe(input.steps.length);
    }
  });
});

describe("money", () => {
  const usd = { code: "USD", symbol: "$", symbolPosition: "before", decimals: 2 } as const;
  const aed = { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 } as const;
  const eur = { code: "EUR", symbol: "€", symbolPosition: "after", decimals: 2 } as const;
  const jpy = { code: "JPY", symbol: "¥", symbolPosition: "before", decimals: 0 } as const;

  it("formats minor units with the market's symbol and position", () => {
    expect(formatMoney(125_000_000, usd)).toBe("$1,250,000");
    expect(formatMoney(125_000_050, usd)).toBe("$1,250,000.50");
    expect(formatMoney(245_000_000, aed)).toBe("AED 2,450,000");
    expect(formatMoney(99_900, eur)).toBe("999 €");
    expect(formatMoney(1_500_000, jpy)).toBe("¥1,500,000");
  });

  it("converts to minor units without float drift", () => {
    expect(toMinor(1_250_000.5, 2)).toBe(125_000_050);
    expect(toMinor(0.29, 2)).toBe(29);
    expect(toMinor(1500, 0)).toBe(1500);
    expect(toMinor(1.2345, 3)).toBe(1235);
  });
});
