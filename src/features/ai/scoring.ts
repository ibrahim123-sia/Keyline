import "server-only";
import { z } from "zod";
import type { DbOrTx } from "@/db/client";
import {
  ruleItems,
  scoreFromItems,
  scoreRubric,
  SCORE_BASE,
  type RubricKey,
  type ScoreInput,
  type ScoreReason,
} from "@/features/leads/score";
import { prompt } from "./prompts";
import { parseJsonReply, runAgent } from "./runner";
import type { AiProvider } from "./types";

/**
 * AI lead score (10 §2): the model picks which items of the same rubric as the rule-based
 * score apply, citing evidence; the points come from the rubric, never from the model. When
 * AI is off, over budget, fails or answers badly, the rule-based score is used instead.
 */

export function rubricPromptLines(): string {
  return scoreRubric
    .map((i) => `- ${i.key} (${i.points > 0 ? "+" : ""}${i.points}): ${i.meaning}`)
    .join("\n");
}

export function scoringSystemPrompt(): string {
  return prompt("scoring", { rubric: rubricPromptLines(), base: SCORE_BASE });
}

const rubricKeys = scoreRubric.map((i) => i.key) as [RubricKey, ...RubricKey[]];

const replySchema = z.object({
  items: z
    .array(z.object({ key: z.enum(rubricKeys), evidence: z.string().max(300).optional() }))
    .max(scoreRubric.length),
});

/** The model's reply as rubric items, or null when it is not valid. */
export function parseScoringReply(
  text: string,
): Array<{ key: RubricKey; evidence?: string }> | null {
  const parsed = replySchema.safeParse(parseJsonReply(text));
  if (!parsed.success) return null;
  const seen = new Set<RubricKey>();
  return parsed.data.items.filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
}

export type LeadScoreResult = {
  score: number;
  reasons: ScoreReason[];
  source: "ai" | "rules";
  /** Why the rules were used (AI off, over budget, failed, bad reply). */
  fallbackReason?: string;
};

export type LeadForScoring = {
  rules: ScoreInput;
  /** What the AI reads: the lead's requirements, the homes asked about, their messages. */
  facts: Record<string, unknown>;
  /** The lead's own messages, oldest first (cut to the last few). */
  messages: string[];
};

export async function scoreLeadWithAi(
  lead: LeadForScoring,
  options: { db?: DbOrTx; provider?: AiProvider; now?: Date } = {},
): Promise<LeadScoreResult> {
  const fallback = (reason: string): LeadScoreResult => ({
    ...scoreFromItems(ruleItems(lead.rules)),
    source: "rules",
    fallbackReason: reason,
  });

  const data = JSON.stringify({
    ...lead.facts,
    hasEmail: lead.rules.hasEmail,
    hasPhone: lead.rules.hasPhone,
    askedForViewing: lead.rules.askedForViewing,
    preApproved: lead.rules.preApproved,
    messages: lead.messages.slice(-20).map((m) => m.slice(0, 1000)),
  }).replace(/</g, "\\u003c");

  const run = await runAgent({
    feature: "scoring",
    tier: "fast",
    system: scoringSystemPrompt(),
    messages: [{ role: "user", content: [{ type: "text", text: `<lead>\n${data}\n</lead>` }] }],
    context: { actor: { type: "visitor", visitorId: null } },
    maxSteps: 1,
    maxTokens: 1024,
    effort: "low",
    db: options.db,
    provider: options.provider,
    now: options.now,
  });
  if (run.status === "unavailable") return fallback(run.unavailable?.reason ?? "unavailable");
  if (run.status !== "done") return fallback(run.status);
  const items = parseScoringReply(run.text);
  if (!items) return fallback("bad_reply");

  // Facts Propel knows for sure win over the model: contact details and viewings.
  const keys = new Set(items.map((i) => i.key));
  const sure = new Set(ruleItems(lead.rules));
  for (const k of ["fullContact", "someContact", "askedViewing"] as const) {
    if (sure.has(k)) keys.add(k);
    else keys.delete(k);
  }
  return { ...scoreFromItems(keys), source: "ai" };
}
