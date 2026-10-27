import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { jobRuns } from "@/db/schema/system";
import { getJob } from "./registry";

/** Retry delay: 30s, 1m, 2m, 4m, 8m... capped at 1 hour. */
export function backoffSeconds(attempt: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
}

export type RunOutcome = "succeeded" | "retry" | "dead" | "skipped";

/**
 * Runs one job row. Safe to call twice for the same id: only a `queued` row whose time has
 * come is claimed (atomically), so concurrent consumers never run a job twice.
 */
export async function runJob(jobId: string): Promise<RunOutcome> {
  const db = await getDb();
  const [claimed] = await db
    .update(jobRuns)
    .set({ status: "running", startedAt: new Date(), attempts: sql`${jobRuns.attempts} + 1` })
    .where(
      and(eq(jobRuns.id, jobId), eq(jobRuns.status, "queued"), lte(jobRuns.runAfter, new Date())),
    )
    .returning();
  if (!claimed) return "skipped";

  const def = getJob(claimed.name);
  const log = (message: string, extra?: Record<string, unknown>) =>
    console.log(JSON.stringify({ level: "info", job: claimed.name, jobId, message, ...extra }));

  try {
    if (!def) throw new Error(`Unknown job "${claimed.name}"`);
    const payload = def.payload.parse(claimed.payload);
    const result = await def.run(payload, { db, jobId, attempt: claimed.attempts, log });
    await db
      .update(jobRuns)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        lastError: null,
        result: (result ?? null) as never,
      })
      .where(eq(jobRuns.id, jobId));
    return "succeeded";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const dead = claimed.attempts >= claimed.maxAttempts || !def;
    await db
      .update(jobRuns)
      .set({
        status: dead ? "dead" : "queued",
        finishedAt: new Date(),
        lastError: message.slice(0, 2000),
        runAfter: dead
          ? claimed.runAfter
          : new Date(Date.now() + backoffSeconds(claimed.attempts) * 1000),
      })
      .where(eq(jobRuns.id, jobId));
    console.error(
      JSON.stringify({
        level: "error",
        job: claimed.name,
        jobId,
        attempt: claimed.attempts,
        error: message,
      }),
    );
    return dead ? "dead" : "retry";
  }
}

/** Runs queued jobs whose time has come (cron every minute; also covers retries). */
export async function runDueJobs(limit = 25): Promise<{ ran: number }> {
  const db = await getDb();
  const due = await db
    .select({ id: jobRuns.id })
    .from(jobRuns)
    .where(and(eq(jobRuns.status, "queued"), lte(jobRuns.runAfter, new Date())))
    .orderBy(asc(jobRuns.runAfter))
    .limit(limit);
  for (const job of due) await runJob(job.id);
  return { ran: due.length };
}

/** Jobs stuck in `running` (worker killed mid-run) go back to the queue. */
export async function requeueStuckJobs(olderThanMinutes = 15): Promise<number> {
  const db = await getDb();
  const rows = await db
    .update(jobRuns)
    .set({ status: "queued", runAfter: new Date() })
    .where(
      and(
        eq(jobRuns.status, "running"),
        lte(jobRuns.startedAt, new Date(Date.now() - olderThanMinutes * 60_000)),
      ),
    )
    .returning({ id: jobRuns.id });
  return rows.length;
}

/** Admin "Retry" on the Jobs page: puts failed/dead runs back in the queue. */
export async function retryJobs(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await getDb();
  const rows = await db
    .update(jobRuns)
    .set({
      status: "queued",
      runAfter: new Date(),
      maxAttempts: sql`greatest(${jobRuns.maxAttempts}, ${jobRuns.attempts} + 1)`,
    })
    .where(and(inArray(jobRuns.id, ids), inArray(jobRuns.status, ["failed", "dead"])))
    .returning({ id: jobRuns.id });
  return rows.length;
}
