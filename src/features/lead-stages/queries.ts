import { asc, eq } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { leadStages } from "@/db/schema/master-data";
import type { Usage } from "@/lib/usage-registry";
import type { LeadStageKind } from "./schema";
import { leadStageUsage } from "./usage";

export type LeadStageRow = {
  id: string;
  name: string;
  color: string;
  kind: LeadStageKind;
  sortOrder: number;
  usage: Usage;
};

/** The pipeline in order (the first open stage is where new leads start). */
export async function listLeadStages(db?: DbOrTx): Promise<LeadStageRow[]> {
  const conn = db ?? (await getDb());
  const rows = await conn
    .select()
    .from(leadStages)
    .where(eq(leadStages.agencyId, currentAgencyId()))
    .orderBy(asc(leadStages.sortOrder), asc(leadStages.name));
  const usage = await leadStageUsage(
    conn,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    kind: r.kind,
    sortOrder: r.sortOrder,
    usage: usage.get(r.id) ?? { total: 0, parts: [] },
  }));
}
