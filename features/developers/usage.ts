import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { projects } from "@/db/schema/projects";
import { usageRegistry, type UsageRef } from "@/lib/usage-registry";

/**
 * What references a developer (projects, from Phase 3), for usage counts, safe delete and
 * "merge into…" (07 §1). Each feature registers its table here.
 */
const registry = usageRegistry();

registry.register({
  label: "projects",
  table: projects,
  column: projects.developerId,
  merge: async (db, fromId, toId) => {
    await db.update(projects).set({ developerId: toId }).where(eq(projects.developerId, fromId));
  },
});

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
