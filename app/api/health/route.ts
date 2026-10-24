import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { log } from "@/lib/log";

/**
 * Health check (14 §5): app is up and the database answers; `jobs` is "behind" when queued jobs
 * wait more than 5 minutes past their time (the every-minute trigger is not running). The
 * status code follows the database only. No personal data.
 */
export async function GET(): Promise<Response> {
  await connection();
  const started = Date.now();
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    const dbMs = Date.now() - started;
    const late = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from job_runs where status = 'queued' and run_after < now() - interval '5 minutes'`,
    );
    const jobs = (late.rows[0]?.n ?? 0) > 0 ? "behind" : "ok";
    return Response.json(
      { ok: true, db: "up", dbMs, jobs },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    log("error", "health.db_failed", { error: err as Error });
    return Response.json(
      { ok: false, db: "down" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
