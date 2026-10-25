import { closeDb, getDb } from "@/db/client";
import { AnthropicProvider } from "@/features/ai/providers/anthropic";
import { setProviderOverride } from "@/features/ai/config";
import { patchSettings } from "@/features/settings/mutations";
import { loadSettings } from "@/features/settings/queries";
import { evalAgents } from "../tests/ai/agents";
import { seedEvalWorld } from "../tests/ai/fixtures";
import { formatReport, loadEvalCases, runEval } from "../tests/ai/runner";
import { startTestDatabase } from "./test-db";

/**
 * `pnpm ai:eval`: runs the eval set (tests/ai/cases) against a throwaway in-memory database
 * with the fictional eval world, and prints the pass rate (10 §6: run it before changing
 * prompts or models).
 *
 * The built-in test provider is used unless a real one is asked for explicitly:
 *   AI_EVAL_PROVIDER=anthropic AI_EVAL_API_KEY=... [AI_EVAL_MODEL=<model id>] pnpm ai:eval
 * That spends real money; tests and CI never set it. AI_EVAL_MIN_PASS (0-1, default 1) sets
 * the pass rate below which the command fails.
 */

const provider = process.env.AI_EVAL_PROVIDER === "anthropic" ? "anthropic" : "mock";
if (provider === "anthropic" && !process.env.AI_EVAL_API_KEY) {
  console.error("AI_EVAL_PROVIDER=anthropic needs AI_EVAL_API_KEY.");
  process.exit(1);
}
const minPass = Number(process.env.AI_EVAL_MIN_PASS ?? 1);

process.env.JOBS_DRIVER = "manual";
process.env.SECRETS_ENCRYPTION_KEY ??= "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="; // eval only
const database = await startTestDatabase();
process.env.DATABASE_URL = database.url;
let failed = false;
try {
  const db = await getDb();
  const world = await seedEvalWorld(db);
  const system = { type: "system" as const, id: null };
  const integrations = await loadSettings("integrations", db);
  await patchSettings(
    db,
    "integrations",
    {
      ai: {
        ...integrations.ai,
        enabled: true,
        provider,
        ...(process.env.AI_EVAL_MODEL
          ? { chatModel: process.env.AI_EVAL_MODEL, fastModel: process.env.AI_EVAL_MODEL }
          : {}),
      },
    },
    system,
  );
  if (provider === "anthropic")
    setProviderOverride(new AnthropicProvider({ apiKey: process.env.AI_EVAL_API_KEY! }));

  const agent = evalAgents.customer?.(db, world) ?? null;
  const report = await runEval({ cases: loadEvalCases(), world, db, agent });
  console.log(`[ai:eval] provider: ${provider}\n`);
  console.log(formatReport(report));
  failed = report.passRate < minPass;
} catch (err) {
  console.error("[ai:eval] failed:", err);
  failed = true;
} finally {
  await closeDb();
  await database.stop();
}
process.exit(failed ? 1 : 0);
