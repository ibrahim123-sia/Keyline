import type { z } from "zod";
import type { Db } from "@/db/client";

/**
 * A background job (13-integrations-and-jobs.md §2): idempotent, validated payload,
 * retried with backoff up to `maxAttempts`, then marked dead (dead-letter).
 */
export type JobDefinition<S extends z.ZodType = z.ZodType> = {
  name: string;
  payload: S;
  maxAttempts?: number;
  run: (payload: z.output<S>, ctx: JobContext) => Promise<unknown>;
};

export type JobContext = {
  db: Db;
  jobId: string;
  attempt: number;
  log: (message: string, extra?: Record<string, unknown>) => void;
};

export function defineJob<S extends z.ZodType>(def: JobDefinition<S>): JobDefinition<S> {
  return def;
}
