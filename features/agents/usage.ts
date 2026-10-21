import type { DbOrTx } from "@/db/client";
import { posts } from "@/db/schema/content";
import { leads, leadTasks } from "@/db/schema/crm";
import { properties } from "@/db/schema/properties";
import { usageRegistry, type UsageRef } from "@/lib/usage-registry";

/**
 * What is assigned to an agent profile: listings (Phase 3), leads, viewings and tasks
 * (Phase 6), posts (Phase 5). An agent in use cannot be deleted; deactivate them instead.
 */
const registry = usageRegistry();

registry.register({ label: "listings", table: properties, column: properties.agentId });
registry.register({ label: "posts", table: posts, column: posts.authorAgentId });
registry.register({ label: "leads", table: leads, column: leads.agentId });
registry.register({ label: "lead tasks", table: leadTasks, column: leadTasks.agentId });

export function registerAgentUsage(ref: UsageRef): void {
  registry.register(ref);
}

export function agentUsage(db: DbOrTx, ids: string[]) {
  return registry.counts(db, ids);
}
