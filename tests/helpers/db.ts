import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

/**
 * Empties the given tables. Triggers are disabled for the clean-up so the append-only
 * audit_log can be cleared between tests (never possible in app code).
 */
export async function truncate(...tables: string[]): Promise<void> {
  if (tables.length === 0) return;
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL session_replication_role = replica`);
    await tx.execute(
      sql.raw(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`),
    );
  });
}
