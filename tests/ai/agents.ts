import type { DbOrTx } from "@/db/client";
import type { EvalWorld } from "./fixtures";
import type { EvalAgent } from "./types";

/**
 * Assistants under test. The customer assistant registers a factory here (it gets the
 * database and the fixture world, and runs one turn per question), e.g.
 *   customer: (db, world) => async ({ question, page }) => ({ text, toolCalls, handedOver })
 * Without one, `assistant` cases are reported as pending.
 */
export const evalAgents: Partial<Record<"customer", (db: DbOrTx, world: EvalWorld) => EvalAgent>> =
  {};
