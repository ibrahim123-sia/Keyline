import { count, inArray } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { DbOrTx } from "@/db/client";

/**
 * "Used by 23 listings" for one kind of record: each feature that references it registers
 * its table, so safe delete and merge never miss a reference added in a later phase.
 */
export type UsageRef = {
  /** Plural noun for the UI, e.g. "projects". */
  label: string;
  table: PgTable;
  column: PgColumn;
  /** Re-point references from one record to another (merge). */
  merge?: (db: DbOrTx, fromId: string, toId: string) => Promise<void>;
};

export type Usage = { total: number; parts: Array<{ label: string; count: number }> };

export function usageRegistry() {
  const refs: UsageRef[] = [];
  return {
    register(ref: UsageRef): void {
      if (!refs.some((r) => r.label === ref.label && r.table === ref.table)) refs.push(ref);
    },
    refs(): readonly UsageRef[] {
      return refs;
    },
    /** id -> usage, for these ids (one query per registered table, run in order). */
    async counts(db: DbOrTx, ids: string[]): Promise<Map<string, Usage>> {
      const result = new Map<string, Usage>(ids.map((id) => [id, { total: 0, parts: [] }]));
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
    },
  };
}

export function describeUsage(usage: Usage): string {
  return usage.parts.map((p) => `${p.count} ${p.label}`).join(" and ");
}
