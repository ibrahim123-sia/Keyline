import type { DbOrTx } from "@/db/client";
import { usageRegistry, type UsageRef } from "@/lib/usage-registry";

/**
 * What references a developer (projects, from Phase 3), for usage counts, safe delete and
 * "merge into…" (07 §1). Each feature registers its table here.
 */
const registry = usageRegistry();

export type DeveloperRef = UsageRef;

export function registerDeveloperUsage(ref: UsageRef): void {
  registry.register(ref);
}

export function developerRefs() {
  return registry.refs();
}

export function developerUsage(db: DbOrTx, ids: string[]) {
  return registry.counts(db, ids);
}
