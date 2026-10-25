import { normalizeWords } from "../embeddings/provider";

/**
 * Ranking maths for hybrid search (10 §1), pure so it can be unit-tested: reciprocal rank
 * fusion of the vector, full-text and structured result lists, then a confidence signal the
 * assistants use to decide whether they may answer or must say they don't know.
 */

export type RankedList = { name: string; weight: number; ids: string[] };

export type FusedItem = { id: string; score: number; ranks: Record<string, number> };

/** Weighted reciprocal rank fusion: score = Σ weight / (k + rank), rank from 1. */
export function fuseRankings(lists: RankedList[], k = 60): FusedItem[] {
  const items = new Map<string, FusedItem>();
  for (const list of lists) {
    list.ids.forEach((id, index) => {
      const item = items.get(id) ?? { id, score: 0, ranks: {} };
      if (item.ranks[list.name] !== undefined) return; // first (best) position only
      item.ranks[list.name] = index + 1;
      item.score += list.weight / (k + index + 1);
      items.set(id, item);
    });
  }
  // Ties keep the order of the first list that has the item (stable, deterministic).
  const firstSeen = new Map<string, number>();
  let n = 0;
  for (const list of lists)
    for (const id of list.ids) if (!firstSeen.has(id)) firstSeen.set(id, n++);
  return [...items.values()].sort(
    (a, b) => b.score - a.score || firstSeen.get(a.id)! - firstSeen.get(b.id)!,
  );
}

export type Confidence = "high" | "medium" | "low" | "none";

export type ConfidenceInput = {
  /** Listings that pass the structured filters. */
  candidates: number;
  /** Filters beyond buy/rent were given (area, beds, price…). */
  specificFilters: boolean;
  /** Free text was given. */
  hasText: boolean;
  /** Best cosine similarity among the returned listings (null: no vectors). */
  topSimilarity: number | null;
  /** The best result also matched the words of the text. */
  textMatch: boolean;
  thresholds: { high: number; low: number };
};

/**
 * - none: nothing matches the filters;
 * - high: exact filters without text, or text that matches strongly;
 * - medium: a reasonable match (or precise filters with vague text);
 * - low: results exist but nothing supports the text: the assistant must not present them as
 *   an answer, it says it doesn't know and offers a person.
 */
export function confidenceFor(input: ConfidenceInput): Confidence {
  if (input.candidates === 0) return "none";
  if (!input.hasText) return input.specificFilters ? "high" : "medium";
  const sim = input.topSimilarity ?? 0;
  if (sim >= input.thresholds.high || (input.textMatch && sim >= input.thresholds.low))
    return "high";
  if (sim >= input.thresholds.low || input.textMatch || input.specificFilters) return "medium";
  return "low";
}

export const confidenceAdvice: Record<Confidence, string> = {
  high: "These listings match. Present them as cards.",
  medium: "These listings partly match. Present them as options and ask what matters most.",
  low: "No listing clearly matches. Say you don't know of a match and offer to connect the visitor with the team.",
  none: "No listing matches. Say so, suggest widening the search, and offer to connect the visitor with the team.",
};

/** Words of the text as an OR prefix query (every word is letters and digits only). */
export function orTsQuery(text: string): string | null {
  const words = [...new Set(normalizeWords(text))].slice(0, 16);
  return words.length ? words.map((w) => `${w}:*`).join(" | ") : null;
}
