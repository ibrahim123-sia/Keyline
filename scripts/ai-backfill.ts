import "./_env";
import { parseArgs } from "node:util";
import { closeDb, getDb } from "@/db/client";
import { embeddingEntityTypes, type EmbeddingEntityType } from "@/db/schema/ai";
import { backfillEmbeddings } from "@/features/ai/embeddings";

/**
 * `pnpm ai:backfill [--type=property,faq]`: builds the assistants' search index for every
 * public entity and removes leftovers (10 §1). Unchanged chunks are skipped, so it is cheap to
 * run again. On Cloudflare the nightly `ai.embed_backfill` job does the same.
 */
const { values } = parseArgs({ options: { type: { type: "string" } } });
const types = values.type
  ?.split(",")
  .map((t) => t.trim())
  .filter(Boolean) as EmbeddingEntityType[] | undefined;
const unknown = types?.filter((t) => !(embeddingEntityTypes as readonly string[]).includes(t));
if (unknown?.length) {
  console.error(
    `Unknown type(s): ${unknown.join(", ")}. Types: ${embeddingEntityTypes.join(", ")}`,
  );
  process.exit(1);
}

try {
  const started = Date.now();
  const result = await backfillEmbeddings(await getDb(), { types });
  console.log(`[ai:backfill] done in ${Date.now() - started} ms:`, result);
} catch (err) {
  console.error("[ai:backfill] failed:", err);
  process.exitCode = 1;
} finally {
  await closeDb();
}
