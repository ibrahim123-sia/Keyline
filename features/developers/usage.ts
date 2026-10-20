import { count, inArray } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { DbOrTx } from "@/db/client";

/**
 * What references a developer (projects, from Phase 3), for usage counts, safe delete and
 * "merge into…" (07 §1). Each feature registers its table here.
 */
export type DeveloperRef = {
  /** Plural noun for the UI, e.g. "projects". */
  label: string;
  table: PgTable;
  column: PgColumn;
  /** Re-point references from one developer to another (merge). */
  merge: (db: DbOrTx, fromId: string, toId: string) => Promise<void>;
};

const refs: DeveloperRef[] = [];

export function registerDeveloperUsage(ref: DeveloperRef): void {
  if (!refs.some((r) => r.label === ref.label && r.table === ref.table)) refs.push(ref);
}

export function developerRefs(): readonly DeveloperRef[] {
  return refs;
}

/** id -> { total, parts } for these developers. */
export async function developerUsage(
  db: DbOrTx,
  ids: string[],
): Promise<Map<string, { total: number; parts: Array<{ label: string; count: number }> }>> {
  const result = new Map(
    ids.map((id) => [id, { total: 0, parts: [] as Array<{ label: string; count: number }> }]),
  );
  if (ids.length === 0) return result;
  for (const ref of refs) {
    const rows = await db
      .select({ id: ref.column, n: count() })
      .from(ref.table)
      .where(inArray(ref.column, ids))
      .groupBy(ref.column);
    for (const row of rows) {
      const entry = result.get(row.id as string);
      if (!entry || row.n === 0) continue;
      entry.total += row.n;
      entry.parts.push({ label: ref.label, count: row.n });
    }
  }
  return result;
}
