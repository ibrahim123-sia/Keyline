"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { ActionError, adminAction } from "@/lib/actions";
import { writeAudit } from "@/lib/audit";
import { capturePortalLead } from "./capture";
import { CsvConnector } from "./connector";
import { guessPortalMapping, readPortalCsv, rowToRaw } from "./csv";

const MAX_ROWS = 2000;
const csvText = z.string().min(1, "Choose a CSV file").max(4_000_000, "That file is too large");
const column = z.number().int().min(0).max(200).nullable();

/** The header, a guessed column mapping and a few rows, before anything is imported. */
export const previewPortalCsv = adminAction(z.object({ csv: csvText }), {}, async ({ csv }) => {
  const { headers, rows } = readPortalCsv(csv);
  if (headers.length === 0) throw new ActionError("This file has no header row.", "VALIDATION");
  return {
    headers,
    mapping: guessPortalMapping(headers),
    sample: rows.slice(0, 5),
    total: rows.length,
  };
});

/** Portal leads from a CSV export (13 §1): each row through the lead pipeline, deduped. */
export const importPortalCsv = adminAction(
  z.object({
    portal: z.string().trim().min(1, "Choose the portal").max(40),
    csv: csvText,
    mapping: z.object({
      name: column,
      email: column,
      phone: column,
      reference: column,
      message: column,
    }),
  }),
  { write: true },
  async (input, ctx) => {
    if (input.mapping.email === null && input.mapping.phone === null)
      throw new ActionError("Choose the email or the phone column.", "VALIDATION");
    const { rows } = readPortalCsv(input.csv);
    if (rows.length > MAX_ROWS)
      throw new ActionError(`Import at most ${MAX_ROWS} rows at a time.`, "VALIDATION");
    const db = await getDb();
    const connector = new CsvConnector(input.portal, input.portal);
    let created = 0;
    let joined = 0;
    let skipped = 0;
    for (const row of rows) {
      const lead = connector.normaliseLead(rowToRaw(row, input.mapping));
      if (!lead) {
        skipped++;
        continue;
      }
      const res = await capturePortalLead(db, { portal: input.portal, lead, via: "csv" });
      if (!res) skipped++;
      else if (res.isNew) created++;
      else joined++;
    }
    await writeAudit(db, {
      actor: ctx.actor,
      action: "portal.csv_import",
      entityType: "lead",
      after: { portal: input.portal, rows: rows.length, created, joined, skipped },
    });
    return { created, joined, skipped };
  },
);
