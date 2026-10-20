import type { DbOrTx } from "@/db/client";
import { usageRegistry, type UsageRef } from "@/lib/usage-registry";

/**
 * What is assigned to an agent profile: listings (Phase 3), leads, viewings and tasks
 * (Phase 6), posts (Phase 5). An agent in use cannot be deleted; deactivate them instead.
 */
const registry = usageRegistry();

export function registerAgentUsage(ref: UsageRef): void {
  registry.register(ref);
}

export function agentUsage(db: DbOrTx, ids: string[]) {
  return registry.counts(db, ids);
}
