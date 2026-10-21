import type { Requirements } from "@/db/schema/crm";
import { leads as t } from "@/lib/i18n/dictionaries/leads";

/**
 * Lead score 0-100 by the rubric in 10 §2 "Lead score", with its reasons (the UI always shows
 * them, never just the number). Rules only; Phase 9 lets the AI score with the same rubric
 * when it is turned on. Pure.
 */
export type ScoreInput = {
  requirements: Requirements;
  hasEmail: boolean;
  hasPhone: boolean;
  /** Asked for a tour, or a viewing is booked. */
  askedForViewing: boolean;
  /** Prices (minor units) of the homes asked about, for "budget fits". */
  listingPrices: number[];
  /** A mortgage pre-approval request came in. */
  preApproved: boolean;
  /** Anything written by the lead (messages, chat). */
  hasMessage: boolean;
};

export type ScoreReason = { label: string; points: number };

const BASE = 30;

export function scoreLead(input: ScoreInput): { score: number; reasons: ScoreReason[] } {
  const r = input.requirements;
  const reasons: ScoreReason[] = [];
  const add = (label: string, points: number) => reasons.push({ label, points });

  const stated = r.budgetFrom === "lead" && (r.budgetMin != null || r.budgetMax != null);
  if (stated) {
    add(t.score.statedBudget, 15);
    const min = r.budgetMin ?? 0;
    const max = r.budgetMax ?? Number.POSITIVE_INFINITY;
    if (
      input.listingPrices.length > 0 &&
      input.listingPrices.some((p) => p >= min * 0.9 && p <= max * 1.1)
    )
      add(t.score.budgetFits, 10);
  }
  if (r.timeline === "now" || r.timeline === "1_3_months") add(t.score.soonTimeline, 15);
  if (r.finance === "cash" || input.preApproved) add(t.score.cashOrApproved, 10);
  if (input.hasEmail && input.hasPhone) add(t.score.fullContact, 10);
  else if (input.hasEmail || input.hasPhone) add(t.score.someContact, 5);
  if (input.askedForViewing) add(t.score.askedViewing, 15);
  const saidLittle =
    !input.hasMessage && !stated && !r.timeline && !input.askedForViewing && !r.bedsMin;
  if (r.timeline === "browsing" || saidLittle) add(t.score.vague, -15);

  const score = Math.max(0, Math.min(100, BASE + reasons.reduce((n, x) => n + x.points, 0)));
  return { score, reasons };
}

/** "+15 Asked for a viewing" lines, as stored with the lead. */
export const reasonsText = (reasons: ScoreReason[]) =>
  reasons.map((x) => `${x.points > 0 ? "+" : ""}${x.points} ${x.label}`).join("\n");
