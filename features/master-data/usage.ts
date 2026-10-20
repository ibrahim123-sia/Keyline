import { count, eq, inArray } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { DbOrTx } from "@/db/client";
import { pois } from "@/db/schema/master-data";
import type { MasterKind } from "./config";

/**
 * What references each master data item, for the "used by 23 listings" count, safe delete
 * (blocked while in use) and "merge into…" (07 §1). Later phases add their tables here.
 */
export type UsageRef = {
  /** Plural noun for the UI, e.g. "listings". */
  label: string;
  table: PgTable;
  column: PgColumn;
  /** Re-point references from one item to another (merge). */
  merge: (db: DbOrTx, fromId: string, toId: string) => Promise<void>;
};

const refs: Record<MasterKind, UsageRef[]> = {
  "property-types": [],
  facilities: [],
  badges: [],
  "poi-types": [
    {
      label: "places",
      table: pois,
      column: pois.poiTypeId,
      merge: async (db, fromId, toId) => {
        await db.update(pois).set({ poiTypeId: toId }).where(eq(pois.poiTypeId, fromId));
      },
    },
  ],
};

export function registerUsage(kind: MasterKind, ref: UsageRef): void {
  if (!refs[kind].some((r) => r.label === ref.label && r.table === ref.table)) refs[kind].push(ref);
}

export function usageRefs(kind: MasterKind): UsageRef[] {
  return refs[kind];
}

/** id -> { total, parts: [{label, count}] } for the given ids. */
export async function usageCounts(
  db: DbOrTx,
  kind: MasterKind,
  ids: string[],
): Promise<Map<string, { total: number; parts: Array<{ label: string; count: number }> }>> {
  const result = new Map<
    string,
    { total: number; parts: Array<{ label: string; count: number }> }
  >();
  for (const id of ids) result.set(id, { total: 0, parts: [] });
  if (ids.length === 0) return result;
  for (const ref of refs[kind]) {
    const rows = await db
      .select({ id: ref.column, n: count() })
      .from(ref.table)
      .where(inArray(ref.column, ids))
      .groupBy(ref.column);
    for (const row of rows) {
      const entry = result.get(String(row.id));
      if (!entry) continue;
      entry.total += Number(row.n);
      entry.parts.push({ label: ref.label, count: Number(row.n) });
    }
  }
  return result;
}

export function describeUsage(parts: Array<{ label: string; count: number }>): string {
  return parts.map((p) => `${p.count} ${p.label}`).join(", ");
}
