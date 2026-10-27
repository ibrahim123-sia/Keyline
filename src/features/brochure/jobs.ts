import "server-only";
import { z } from "zod";
import type { DbOrTx } from "@/db/client";
import { enqueue } from "@/jobs/enqueue";
import { defineJob } from "@/jobs/types";
import { loadBrochure } from "./data";
import { generatedBrochure } from "./render";
import { brochureKinds, type BrochureKind } from "./types";

/** Saves come in bursts (the editor autosaves every 10 s): one render a few minutes later. */
const SETTLE_MS = 3 * 60_000;

/**
 * `brochure.render` (13 §2: listing changed, on demand): draws the current version and keeps
 * it, so the next visitor gets the PDF at once. Skips listings that are not public, those with
 * an uploaded brochure (that one is what visitors get), and versions already stored.
 */
export const brochureRenderJob = defineJob({
  name: "brochure.render",
  payload: z.object({ kind: z.enum(brochureKinds), id: z.uuid() }),
  maxAttempts: 3,
  async run({ kind, id }, { db }) {
    const loaded = await loadBrochure(db, kind, id);
    if (!loaded) return { skipped: "not public" };
    if (loaded.uploaded) return { skipped: "uploaded brochure" };
    const result = await generatedBrochure(loaded);
    return { version: result.version, rendered: result.rendered, bytes: result.bytes.length };
  },
});

/** Queues a fresh brochure after a change; repeated changes within a few minutes join one job. */
export async function queueBrochureRender(
  kind: BrochureKind,
  ids: Array<string | null | undefined>,
  db?: DbOrTx,
): Promise<void> {
  const runAfter = new Date(Date.now() + SETTLE_MS);
  for (const id of new Set(ids.filter((x): x is string => Boolean(x))))
    await enqueue(
      "brochure.render",
      { kind, id },
      { db, runAfter, dedupeKey: `brochure.render:${kind}:${id}` },
    );
}
