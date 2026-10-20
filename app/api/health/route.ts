import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db/client";

/** Health check (14 §5): app is up and the database answers. No personal data. */
export async function GET(): Promise<Response> {
  await connection();
  const started = Date.now();
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json(
      { ok: true, db: "up", dbMs: Date.now() - started },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[health] database check failed:", (err as Error).message);
    return Response.json(
      { ok: false, db: "down" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
