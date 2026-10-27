import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { leads } from "@/db/schema/crm";
import { usageRegistry, type UsageRef } from "@/lib/usage-registry";

/** Leads in each stage. Deleting a stage moves its leads to the stage the admin picks. */
const registry = usageRegistry();

registry.register({
  label: "leads",
  table: leads,
  column: leads.stageId,
  merge: async (db, fromId, toId) => {
    await db.update(leads).set({ stageId: toId }).where(eq(leads.stageId, fromId));
  },
});

export function registerLeadStageUsage(ref: UsageRef): void {
  registry.register(ref);
}

export function leadStageUsage(db: DbOrTx, ids: string[]) {
  return registry.counts(db, ids);
}

export function leadStageRefs() {
  return registry.refs();
}
