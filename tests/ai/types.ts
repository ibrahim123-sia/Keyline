import type { Confidence } from "@/features/ai/retrieval/rank";
import type { HybridFilters } from "@/features/ai/retrieval/hybrid";
import type { EvalFaqKey, EvalListingKey } from "./fixtures";

/**
 * The AI eval set (10 §6): run before changing prompts or models (`pnpm ai:eval`).
 * Cases live in tests/ai/cases/*.json and refer to the fictional world in fixtures.ts by key.
 *
 * - `retrieval`: hybrid search must rank the right live listing first, never return what is
 *   not public, and report weak matches as low confidence (the assistant then says it doesn't
 *   know and offers a person).
 * - `knowledge`: FAQ/page retrieval for `answer_faq`.
 * - `assistant`: a question to the customer assistant with the behaviour expected. These run
 *   once an assistant registers itself in tests/ai/agents.ts; until then they are "pending".
 */

export type RetrievalCase = {
  id: string;
  kind: "retrieval";
  question: string;
  filters?: HybridFilters;
  expect: {
    /** The first result. */
    top?: EvalListingKey;
    includes?: EvalListingKey[];
    excludes?: EvalListingKey[];
    /** Exactly this many results. */
    count?: number;
    confidence?: Confidence[];
  };
};

export type KnowledgeCase = {
  id: string;
  kind: "knowledge";
  question: string;
  expect: { top?: EvalFaqKey; confidence?: Confidence[] };
};

export type AssistantBehaviour =
  /** Answers from tool results only; listings it names were returned by a tool. */
  | "grounded"
  /** Hands over to a person (request_human). */
  | "handover"
  /** Says it doesn't know instead of inventing (no listing named that no tool returned). */
  | "refuse_invent"
  /** Moves the booking flow on (asks for details or checks free slots). */
  | "booking"
  /** Declines a prompt-injection or off-limits request. */
  | "refuse";

export type AssistantCase = {
  id: string;
  kind: "assistant";
  question: string;
  /** What the visitor is looking at (a listing key, an area, a search). */
  page?: { listing?: EvalListingKey; area?: string; search?: string };
  /** Earlier turns, visitor first. */
  history?: string[];
  expect: {
    behaviour: AssistantBehaviour;
    mustCallTools?: string[];
    mustNotCallTools?: string[];
    /** A listing the answer must mention (by its title or reference). */
    mentionsListing?: EvalListingKey;
    /** Regular expressions (case-insensitive) the answer must / must not match. */
    mustSay?: string[];
    mustNotSay?: string[];
  };
};

export type EvalCase = RetrievalCase | KnowledgeCase | AssistantCase;

/** One assistant turn as the harness sees it. */
export type EvalTurn = {
  text: string;
  toolCalls: Array<{ name: string; input: unknown; output?: unknown }>;
  handedOver?: boolean;
};

export type EvalAgent = (input: {
  question: string;
  page?: AssistantCase["page"];
  history?: string[];
}) => Promise<EvalTurn>;

export type EvalResult = {
  id: string;
  kind: EvalCase["kind"];
  status: "pass" | "fail" | "pending";
  problems: string[];
};

export type EvalReport = {
  results: EvalResult[];
  passed: number;
  failed: number;
  pending: number;
  /** Passed out of the cases that ran (pending ones excluded). */
  passRate: number;
};
