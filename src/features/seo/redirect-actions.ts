"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { ActionError, adminAction } from "@/lib/actions";
import { writeAudit } from "@/lib/audit";
import { tags } from "@/lib/cache-tags";
import { setNotFoundResolved } from "./not-found-log";
import { parseRedirectCsv, redirectInputSchema } from "./redirect-schema";
import { fixChains, importRedirectRows, removeRedirects, writeRedirect } from "./redirects-admin";

const ids = z.array(z.uuid()).min(1).max(500);

/** Website -> SEO -> Redirects: add or edit one redirect (audited; loops are refused). */
export const saveRedirect = adminAction(
  z.object({ id: z.uuid().nullable(), data: redirectInputSchema }),
  { write: true },
  async ({ id, data }, ctx) => {
    const db = await getDb();
    const row = await db.transaction((tx) => writeRedirect(tx, id, data, ctx.actor));
    updateTag(tags.redirects);
    return { id: row.id, fromPath: row.fromPath, toPath: row.toPath };
  },
);

export const deleteRedirects = adminAction(
  z.object({ ids }),
  { write: true },
  async (input, ctx) => {
    const db = await getDb();
    const deleted = await db.transaction((tx) => removeRedirects(tx, input.ids, ctx.actor));
    updateTag(tags.redirects);
    return { deleted };
  },
);

/** CSV import: old address, new address, optional type. Bad rows are reported by line. */
export const importRedirects = adminAction(
  z.object({ csv: z.string().max(1_000_000, "The file is too big (1 MB at most)") }),
  { write: true },
  async ({ csv }, ctx) => {
    const { rows, problems } = parseRedirectCsv(csv);
    if (rows.length === 0 && problems.length === 0)
      throw new ActionError("The file has no redirects in it.", "VALIDATION");
    const db = await getDb();
    const result = await db.transaction((tx) => importRedirectRows(tx, rows, ctx.actor));
    updateTag(tags.redirects);
    return {
      created: result.created,
      updated: result.updated,
      problems: [...problems, ...result.skipped].sort((a, b) => a.line - b.line).slice(0, 200),
    };
  },
);

export const fixRedirectChains = adminAction(z.object({}), { write: true }, async (_, ctx) => {
  const db = await getDb();
  const fixed = await db.transaction((tx) => fixChains(tx, ctx.actor));
  updateTag(tags.redirects);
  return { fixed };
});

/** 404 monitor: dismiss entries (or reopen dismissed ones). */
export const setNotFoundStatus = adminAction(
  z.object({ ids, resolved: z.boolean() }),
  { write: true },
  async (input, ctx) => {
    const db = await getDb();
    const changed = await db.transaction(async (tx) => {
      const n = await setNotFoundResolved(tx, input.ids, input.resolved);
      await writeAudit(tx, {
        actor: ctx.actor,
        action: input.resolved ? "not_found.dismiss" : "not_found.reopen",
        entityType: "not_found",
        entityId: input.ids.length === 1 ? input.ids[0]! : null,
        before: null,
        after: { ids: input.ids },
      });
      return n;
    });
    return { changed };
  },
);
