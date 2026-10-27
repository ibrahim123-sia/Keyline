import { and, asc, eq } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { savedViews } from "@/db/schema/saved-views";
import type { SavedView, SavedViewTable } from "./schema";

export async function listSavedViews(tableId: SavedViewTable, db?: DbOrTx): Promise<SavedView[]> {
  const conn = db ?? (await getDb());
  return conn
    .select({ id: savedViews.id, name: savedViews.name, query: savedViews.query })
    .from(savedViews)
    .where(and(eq(savedViews.agencyId, currentAgencyId()), eq(savedViews.tableId, tableId)))
    .orderBy(asc(savedViews.sortOrder), asc(savedViews.name));
}
