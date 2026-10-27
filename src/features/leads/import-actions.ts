"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { leads } from "@/db/schema/crm";
import { loadSettings } from "@/features/settings/queries";
import { ActionError, adminAction } from "@/lib/actions";
import { writeAudit } from "@/lib/audit";
import { captureLead } from "./capture";
import { checkLeadRow, leadImportKeys, leadMappingProblems } from "./csv";
import { loadLeadImportContext } from "./import";
import { manualLeadSchema } from "./schema";
import { applyLeadAgent } from "./stage";

/** Add lead (09 §1 #19): walk-ins, phone calls and referrals, through the same pipeline. */
export const createManualLead = adminAction(
  manualLeadSchema,
  { write: true },
  async (input, ctx) => {
    const db = await getDb();
    const lead = await captureLead(db, {
      source: "manual",
      sourceDetail: input.how,
      type: input.type,
      contact: { name: input.name, email: input.email || null, phone: input.phone || null },
      propertyId: input.propertyId,
      message: input.message || null,
      actor: { type: "admin", id: ctx.user.id },
    });
    await db.transaction(async (tx) => {
      if (input.agentId && input.agentId !== lead.agentId)
        await applyLeadAgent(tx, {
          leadId: lead.leadId,
          agentId: input.agentId,
          actor: ctx.actor,
          now: new Date(),
        });
      await writeAudit(tx, {
        actor: ctx.actor,
        action: lead.isNew ? "lead.create" : "lead.add_contact",
        entityType: "lead",
        entityId: lead.leadId,
        after: { source: "manual", how: input.how, name: input.name },
      });
    });
    return { id: lead.leadId, isNew: lead.isNew };
  },
);

export type LeadImportResult =
  | { line: number; ok: true; leadId: string; isNew: boolean }
  | { line: number; ok: false; errors: string[] };

/**
 * CSV import, one batch (09 §1 #20): at most 50 rows, each checked again here and captured
 * like any lead (source "import"), so duplicates join the person's open lead.
 */
export const importLeadRows = adminAction(
  z
    .object({
      columns: z.array(z.enum(leadImportKeys).nullable()).min(1).max(60),
      rows: z
        .array(
          z.object({
            line: z.number().int().min(1).max(1_000_000),
            cells: z.array(z.string().max(5000)).max(60),
          }),
        )
        .min(1)
        .max(50),
      fileName: z.string().trim().max(120).default(""),
    })
    .strict(),
  { write: true },
  async ({ columns, rows, fileName }, ctx) => {
    const problems = leadMappingProblems(columns);
    if (problems.length) throw new ActionError(problems[0]!, "MAPPING");
    const db = await getDb();
    const context = await loadLeadImportContext(db);
    const market = await loadSettings("market", db);
    const results: LeadImportResult[] = [];
    for (const { line, cells } of rows) {
      const check = checkLeadRow(cells, columns, context);
      if (!check.row) {
        results.push({ line, ok: false, errors: check.errors });
        continue;
      }
      const r = check.row;
      const hasBudget = r.budgetMin !== null || r.budgetMax !== null;
      try {
        const lead = await captureLead(db, {
          source: "import",
          sourceDetail: r.sourceDetail ?? (fileName || null),
          type: r.type,
          contact: { name: r.name, email: r.email, phone: r.phone },
          propertyId: r.propertyId,
          message: r.message,
          requirements: {
            ...(r.purpose ? { purpose: r.purpose } : {}),
            ...(hasBudget
              ? {
                  budgetMin: r.budgetMin,
                  budgetMax: r.budgetMax,
                  currency: market.baseCurrency.code,
                  budgetFrom: "lead" as const,
                }
              : {}),
            ...(r.beds !== null ? { bedsMin: r.beds } : {}),
            ...(r.locationId ? { locationIds: [r.locationId] } : {}),
          },
          actor: { type: "admin", id: ctx.user.id },
        });
        if (r.tags.length) {
          const [row] = await db
            .select({ tags: leads.tags })
            .from(leads)
            .where(eq(leads.id, lead.leadId));
          await db
            .update(leads)
            .set({ tags: [...new Set([...(row?.tags ?? []), ...r.tags])] })
            .where(eq(leads.id, lead.leadId));
        }
        results.push({ line, ok: true, leadId: lead.leadId, isNew: lead.isNew });
      } catch (err) {
        results.push({
          line,
          ok: false,
          errors: [err instanceof ActionError ? err.message : "Could not save this row"],
        });
      }
    }
    await writeAudit(db, {
      actor: ctx.actor,
      action: "lead.import",
      entityType: "lead",
      entityId: null,
      after: {
        fileName: fileName || null,
        imported: results.filter((x) => x.ok).length,
        failed: results.filter((x) => !x.ok).length,
      },
    });
    return results;
  },
);
