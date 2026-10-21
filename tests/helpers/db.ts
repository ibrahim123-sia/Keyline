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

/**
 * The test admin as a real users row (for tables that reference users). Another file may
 * have left a user with the same email under another id, so that one is replaced.
 */
export async function ensureTestAdminUser(): Promise<void> {
  const { testAdmin } = await import("./admin-context");
  const { users } = await import("@/db/schema/auth");
  const { eq, or } = await import("drizzle-orm");
  const db = await getDb();
  await db.delete(users).where(or(eq(users.id, testAdmin.id), eq(users.email, testAdmin.email)));
  await db
    .insert(users)
    .values({ id: testAdmin.id, email: testAdmin.email, name: testAdmin.name, role: "admin" });
}
