import type { AiUsageCount } from "./types";

/**
 * Estimated prices in US dollars per million tokens (Anthropic's first-party list prices,
 * checked 2026-10; Cloudflare Workers AI for embeddings). Used only to estimate spend for the
 * budgets in Settings -> AI; the provider's invoice is the real number. Cache writes are the
 * 5-minute rate (1.25x input).
 */
export type ModelPrice = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Higher rates when one request's prompt is longer than `overTokens`. */
  long?: { overTokens: number; input: number; output: number };
};

export const modelPrices: Record<string, ModelPrice> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
    long: { overTokens: 100_000, input: 0.5, output: 2.5 },
  },
  "@cf/baai/bge-m3": { input: 0.012, output: 0, cacheRead: 0, cacheWrite: 0 },
};

const FREE: ModelPrice = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/**
 * A model missing from the table is priced like the most expensive one, so an unknown model
 * reaches the spend limit early rather than late.
 */
const UNKNOWN: ModelPrice = Object.values(modelPrices).reduce((a, b) =>
  b.input + b.output > a.input + a.output ? b : a,
);

export function priceFor(model: string): ModelPrice {
  if (model.startsWith("mock")) return FREE;
  return modelPrices[model] ?? UNKNOWN;
}

/** Estimated cost of one call in millionths of a US dollar (integer). */
export function costMicros(model: string, usage: AiUsageCount): number {
  const price = priceFor(model);
  const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const long = price.long && promptTokens > price.long.overTokens ? price.long : null;
  // $ per 1M tokens x tokens = millionths of a dollar.
  const micros =
    usage.inputTokens * (long?.input ?? price.input) +
    usage.outputTokens * (long?.output ?? price.output) +
    usage.cacheReadTokens * price.cacheRead +
    usage.cacheWriteTokens * price.cacheWrite;
  return Math.round(micros);
}

/** Micros to whole cents, rounded up (budgets compare in cents). */
export const microsToCents = (micros: number): number => Math.ceil(micros / 10_000);
