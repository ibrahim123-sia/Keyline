import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { aiActions, type AiActionSource } from "@/db/schema/ai";
import { loadSettings } from "@/features/settings/queries";
import { writeAudit, type AuditActor } from "@/lib/audit";
import { can, type AdminContext } from "@/lib/permissions";
import {
  blockedToolReason,
  describeIssues,
  MAX_AI_RECIPIENTS,
  type AnyAiTool,
  type WriteTool,
} from "./tools/registry";

/**
 * The confirm flow's primitives (10 §3): the model proposes, an admin confirms or rejects.
 * The admin assistant UI and the MCP server build on these; nothing here is a public endpoint
 * (callers check the session with `requireAdmin({ write: true })` first).
 */

export type ProposedAction = { id: string; tool: string; preview: Record<string, unknown> };

export class AiActionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_FOUND"
      | "ALREADY_DECIDED"
      | "FORBIDDEN"
      | "BLOCKED"
      | "INVALID"
      | "UNKNOWN_TOOL"
      | "FAILED",
  ) {
    super(message);
    this.name = "AiActionError";
  }
}

/** Checks shared by propose and confirm: hard blocks, recipients, the Settings checkbox. */
async function assertAllowed(
  tool: WriteTool,
  input: unknown,
  source: AiActionSource,
  db: DbOrTx,
): Promise<void> {
  const blocked = blockedToolReason(tool.name);
  if (blocked) throw new AiActionError(blocked, "BLOCKED");
  if (tool.recipients && tool.recipients(input) > MAX_AI_RECIPIENTS)
    throw new AiActionError(
      `The assistant can message at most ${MAX_AI_RECIPIENTS} people at once.`,
      "BLOCKED",
    );
  const ai = await loadSettings("ai", db);
  if (source === "admin_chat" && !ai.adminAssistantEnabled)
    throw new AiActionError("The admin assistant is turned off.", "FORBIDDEN");
  if (source === "mcp" && !ai.features.mcp)
    throw new AiActionError("AI over MCP is turned off.", "FORBIDDEN");
  if (tool.action && !ai.allowedActions[tool.action])
    throw new AiActionError("This action is turned off in Settings -> AI.", "FORBIDDEN");
}

/** Stores a write tool call as a proposal (status `proposed`) with its preview. */
export async function proposeAction(
  input: {
    tool: WriteTool;
    input: unknown;
    preview: Record<string, unknown>;
    adminId: string | null;
    conversationRef?: string | null;
    source?: AiActionSource;
  },
  db?: DbOrTx,
): Promise<ProposedAction> {
  const conn = db ?? (await getDb());
  const source = input.source ?? "admin_chat";
  await assertAllowed(input.tool, input.input, source, conn);
  const [row] = await conn
    .insert(aiActions)
    .values({
      adminId: input.adminId,
      conversationRef: input.conversationRef ?? null,
      tool: input.tool.name,
      input: (input.input ?? {}) as Record<string, unknown>,
      preview: input.preview,
      source,
    })
    .returning({ id: aiActions.id });
  return { id: row!.id, tool: input.tool.name, preview: input.preview };
}

/** The confirming admin must be an active, writable admin allowed to use the assistant. */
function assertAdmin(admin: AdminContext): void {
  const u = admin.user;
  if (u.role !== "admin" || !u.isActive || !can(u.role, "admin.assistant"))
    throw new AiActionError("Only an admin can confirm assistant actions.", "FORBIDDEN");
  if (u.readOnly) throw new AiActionError("This account is read-only.", "FORBIDDEN");
}

async function loadProposed(db: DbOrTx, id: string) {
  const [row] = await db
    .select()
    .from(aiActions)
    .where(and(eq(aiActions.id, id), eq(aiActions.agencyId, currentAgencyId())))
    .for("update")
    .limit(1);
  if (!row) throw new AiActionError("This proposal no longer exists.", "NOT_FOUND");
  if (row.status !== "proposed")
    throw new AiActionError(`This proposal was already ${row.status}.`, "ALREADY_DECIDED");
  return row;
}

export type ConfirmResult = { id: string; status: "executed"; result: unknown };

/**
 * Confirm: re-checks the admin, the switches and hard blocks, validates the (possibly edited)
 * input again, runs the change and writes the audit entry with actor_type `ai` and the
 * confirming admin, all in one transaction. A failure leaves nothing changed and marks the
 * proposal `failed` with the reason.
 */
export async function confirmAction(
  id: string,
  admin: AdminContext,
  options: { tools: AnyAiTool[]; editedInput?: unknown; db?: DbOrTx },
): Promise<ConfirmResult> {
  assertAdmin(admin);
  const conn = options.db ?? (await getDb());
  let ran = false;
  try {
    return await conn.transaction(async (tx) => {
      const row = await loadProposed(tx, id);
      const tool = options.tools.find((t) => t.name === row.tool);
      if (!tool || tool.kind !== "write")
        throw new AiActionError(`Unknown assistant action "${row.tool}".`, "UNKNOWN_TOOL");
      const parsed = tool.input.safeParse(options.editedInput ?? row.input);
      if (!parsed.success) throw new AiActionError(describeIssues(parsed.error), "INVALID");
      await assertAllowed(tool, parsed.data, row.source, tx);

      const auditActor: AuditActor = {
        type: "ai",
        id: row.adminId ?? admin.user.id,
        confirmedBy: admin.user.id,
      };
      const ctx = { db: tx, admin, auditActor, actionId: row.id };
      if (tool.authorize) await tool.authorize(parsed.data, ctx);
      ran = true;
      const result = await tool.execute(parsed.data, ctx);

      await tx
        .update(aiActions)
        .set({
          status: "executed",
          input: parsed.data as Record<string, unknown>,
          result: (result ?? null) as never,
          decidedBy: admin.user.id,
          confirmedAt: sql`now()`,
          executedAt: sql`now()`,
        })
        .where(eq(aiActions.id, row.id));
      await writeAudit(tx, {
        actor: auditActor,
        action: `ai.${row.tool}`,
        entityType: "ai_action",
        entityId: row.id,
        before: options.editedInput === undefined ? null : { input: row.input },
        after: { tool: row.tool, input: parsed.data, result: result ?? null, source: row.source },
      });
      return { id: row.id, status: "executed" as const, result };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Only a change that ran and failed marks the proposal failed; a refused check (bad edit,
    // permissions, a switch turned off) leaves it proposed so it can be fixed or cancelled.
    if (ran)
      await conn
        .update(aiActions)
        .set({ status: "failed", error: message.slice(0, 500), decidedBy: admin.user.id })
        .where(and(eq(aiActions.id, id), eq(aiActions.status, "proposed")));
    if (err instanceof AiActionError) throw err;
    throw new AiActionError(message, "FAILED");
  }
}

/** Reject (Cancel on the preview card): nothing runs; the decision is audited. */
export async function rejectAction(
  id: string,
  admin: AdminContext,
  options: { reason?: string; db?: DbOrTx } = {},
): Promise<void> {
  assertAdmin(admin);
  const conn = options.db ?? (await getDb());
  await conn.transaction(async (tx) => {
    const row = await loadProposed(tx, id);
    await tx
      .update(aiActions)
      .set({
        status: "rejected",
        decidedBy: admin.user.id,
        rejectedAt: sql`now()`,
        error: options.reason?.slice(0, 500) ?? null,
      })
      .where(eq(aiActions.id, row.id));
    await writeAudit(tx, {
      actor: { type: "admin", id: admin.user.id },
      action: "ai_action.reject",
      entityType: "ai_action",
      entityId: row.id,
      after: { tool: row.tool, reason: options.reason ?? null },
    });
  });
}
