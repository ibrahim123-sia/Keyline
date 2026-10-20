import { asc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { tags } from "@/lib/cache-tags";
import type { MasterKind } from "./config";
import { genericTable, type MasterRow } from "./tables";
import { usageCounts } from "./usage";

export type MasterListItem<K extends MasterKind> = MasterRow<K> & {
  usage: { total: number; parts: Array<{ label: string; count: number }> };
};

/** Admin list with usage counts (always fresh). */
export async function listMasterForAdmin<K extends MasterKind>(
  kind: K,
  db?: DbOrTx,
): Promise<MasterListItem<K>[]> {
  const conn = db ?? (await getDb());
  const table = genericTable(kind);
  const rows = (await conn
    .select()
    .from(table)
    .where(eq(table.agencyId, currentAgencyId()))
    .orderBy(asc(table.sortOrder), asc(table.name))) as MasterRow<K>[];
  const usage = await usageCounts(
    conn,
    kind,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({ ...r, usage: usage.get(r.id) ?? { total: 0, parts: [] } }));
}

/** Cached list for rendering the public site and editors (revalidated by tag on change). */
export async function getMasterList<K extends MasterKind>(kind: K): Promise<MasterRow<K>[]> {
  "use cache";
  cacheLife("max");
  cacheTag(tags.masterData(kind));
  const db = await getDb();
  const table = genericTable(kind);
  return (await db
    .select()
    .from(table)
    .where(eq(table.agencyId, currentAgencyId()))
    .orderBy(asc(table.sortOrder), asc(table.name))) as MasterRow<K>[];
}
