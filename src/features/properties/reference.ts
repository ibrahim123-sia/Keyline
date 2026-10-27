import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { loadSettings } from "@/features/settings/queries";

/** Next listing reference, e.g. "HD-1001" (05 §5): prefix from Settings -> General, number from a sequence. */
export async function nextPropertyReference(db: DbOrTx): Promise<string> {
  const { referencePrefix } = await loadSettings("general", db);
  const result = await db.execute<{ n: string }>(
    sql`select nextval('property_reference_seq')::text as n`,
  );
  const n = result.rows[0]!.n;
  return `${referencePrefix}-${n}`;
}
