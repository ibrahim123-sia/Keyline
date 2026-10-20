"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { ActionError, adminAction } from "@/lib/actions";
import { checkRow, importableKeys, mappingProblems, type ImportRowResult } from "./csv";
import { createImportedDraft, loadImportContext, locationSearchText } from "./import";

/**
 * CSV import, one batch (07 §7): the browser sends at most 50 checked rows at a time; each is
 * checked again here against fresh master data and saved as a draft in its own transaction.
 */
export const importPropertyRows = adminAction(
  z.object({
    columns: z.array(z.enum(importableKeys).nullable()).min(1).max(100),
    rows: z
      .array(
        z.object({
          line: z.number().int().min(1).max(1_000_000),
          cells: z.array(z.string().max(20_000)).max(100),
        }),
      )
      .min(1)
      .max(50),
  }),
  { write: true },
  async ({ columns, rows }, ctx) => {
    const problems = mappingProblems(columns);
    if (problems.length) throw new ActionError(problems[0]!, "MAPPING");
    const db = await getDb();
    const context = await loadImportContext(db);
    const results: ImportRowResult[] = [];
    for (const row of rows) {
      const check = checkRow(row.cells, columns, context);
      if (!check.draft) {
        results.push({ line: row.line, ok: false, errors: check.errors });
        continue;
      }
      const draft = check.draft;
      const created = await db.transaction((tx) =>
        createImportedDraft(tx, draft, {
          actor: ctx.actor,
          userId: ctx.user.id,
          line: row.line,
          locationText: locationSearchText(context, draft.locationId),
        }),
      );
      results.push({
        line: row.line,
        ok: true,
        ...created,
        title: draft.title,
        warnings: check.warnings,
      });
    }
    return { results };
  },
);
