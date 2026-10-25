import type { Requirements } from "@/db/schema/crm";
import { leads as t } from "@/lib/i18n/dictionaries/leads";

/**
 * Lead score 0-100 by the rubric in 10 §2 "Lead score", with its reasons (the UI always shows
 * them, never just the number). The rubric below is the single source: the rules here apply
 * it to what Keyline knows for sure, and the AI scorer (features/ai/scoring.ts) applies the
 * same items to the conversation, falling back to these rules. Pure.
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

export const SCORE_BASE = 30;

export type RubricKey =
  | "statedBudget"
  | "budgetFits"
  | "soonTimeline"
  | "cashOrApproved"
  | "fullContact"
  | "someContact"
  | "askedViewing"
  | "vague"
  | "outsideMarket";

export type RubricItem = {
  key: RubricKey;
  label: string;
  points: number;
  /** What the item means, for the AI scorer's prompt. */
  meaning: string;
  /** Only the AI can tell (the rules have no data for it). */
  aiOnly?: boolean;
  /** Cannot apply together with these items (the first listed wins). */
  excludes?: RubricKey[];
};

export const scoreRubric: readonly RubricItem[] = [
  {
    key: "statedBudget",
    label: t.score.statedBudget,
    points: 15,
    meaning: "The lead stated a budget themselves (not worked out from a listing price).",
  },
  {
    key: "budgetFits",
    label: t.score.budgetFits,
    points: 10,
    meaning: "The stated budget fits (within 10%) the price of a home they asked about.",
  },
  {
    key: "soonTimeline",
    label: t.score.soonTimeline,
    points: 15,
    meaning: "They want to buy, rent or move now or within 3 months.",
  },
  {
    key: "cashOrApproved",
    label: t.score.cashOrApproved,
    points: 10,
    meaning: "They pay cash or have a mortgage pre-approval.",
  },
  {
    key: "fullContact",
    label: t.score.fullContact,
    points: 10,
    meaning: "They gave both an email address and a phone number.",
    excludes: ["someContact"],
  },
  {
    key: "someContact",
    label: t.score.someContact,
    points: 5,
    meaning: "They gave an email address or a phone number, but not both.",
  },
  {
    key: "askedViewing",
    label: t.score.askedViewing,
    points: 15,
    meaning: "They asked for a viewing or tour, or one is booked.",
  },
  {
    key: "vague",
    label: t.score.vague,
    points: -15,
    meaning: "They are only browsing, or said almost nothing about what they want.",
  },
  {
    key: "outsideMarket",
    label: t.score.outsideMarket,
    points: -10,
    meaning:
      "What they want is outside the agency's market (areas or property types it does not cover).",
    aiOnly: true,
  },
];

export const rubricItem = (key: RubricKey): RubricItem => scoreRubric.find((i) => i.key === key)!;

/** Score and reasons from the rubric items that apply (shared by the rules and the AI). */
export function scoreFromItems(keys: Iterable<RubricKey>): {
  score: number;
  reasons: ScoreReason[];
} {
  const applied = new Set(keys);
  for (const i of scoreRubric)
    if (applied.has(i.key)) for (const x of i.excludes ?? []) applied.delete(x);
  const reasons = scoreRubric
    .filter((i) => applied.has(i.key))
    .map((i) => ({ label: i.label, points: i.points }));
  const score = Math.max(0, Math.min(100, SCORE_BASE + reasons.reduce((n, x) => n + x.points, 0)));
  return { score, reasons };
}

/** The rubric items the rules can see for sure. */
export function ruleItems(input: ScoreInput): RubricKey[] {
  const r = input.requirements;
  const keys: RubricKey[] = [];
  const stated = r.budgetFrom === "lead" && (r.budgetMin != null || r.budgetMax != null);
  if (stated) {
    keys.push("statedBudget");
    const min = r.budgetMin ?? 0;
    const max = r.budgetMax ?? Number.POSITIVE_INFINITY;
    if (
      input.listingPrices.length > 0 &&
      input.listingPrices.some((p) => p >= min * 0.9 && p <= max * 1.1)
    )
      keys.push("budgetFits");
  }
  if (r.timeline === "now" || r.timeline === "1_3_months") keys.push("soonTimeline");
  if (r.finance === "cash" || input.preApproved) keys.push("cashOrApproved");
  if (input.hasEmail && input.hasPhone) keys.push("fullContact");
  else if (input.hasEmail || input.hasPhone) keys.push("someContact");
  if (input.askedForViewing) keys.push("askedViewing");
  const saidLittle =
    !input.hasMessage && !stated && !r.timeline && !input.askedForViewing && !r.bedsMin;
  if (r.timeline === "browsing" || saidLittle) keys.push("vague");
  return keys;
}

export function scoreLead(input: ScoreInput): { score: number; reasons: ScoreReason[] } {
  return scoreFromItems(ruleItems(input));
}

/** "+15 Asked for a viewing" lines, as stored with the lead. */
export const reasonsText = (reasons: ScoreReason[]) =>
  reasons.map((x) => `${x.points > 0 ? "+" : ""}${x.points} ${x.label}`).join("\n");
