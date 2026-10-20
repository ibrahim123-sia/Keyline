import type { DbOrTx } from "@/db/client";
import { usageRegistry, type UsageRef } from "@/lib/usage-registry";

/** Leads in each stage (Phase 6 registers the leads table). */
const registry = usageRegistry();

export function registerLeadStageUsage(ref: UsageRef): void {
  registry.register(ref);
}

export function leadStageUsage(db: DbOrTx, ids: string[]) {
  return registry.counts(db, ids);
}

export function leadStageRefs() {
  return registry.refs();
}
