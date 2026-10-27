"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { AiActionError, confirmAction, rejectAction } from "@/features/ai/actions";
import { ActionError, adminAction } from "@/lib/actions";
import { can } from "@/lib/permissions";
import { adminWriteTools } from "./admin-write-tools";
import { runAdminTurn } from "./admin";

/** The admin assistant panel's calls (10 §3). Every call checks the admin's session. */

export type AssistantProposal = {
  id: string;
  tool: string;
  preview: Record<string, unknown>;
  input: Record<string, unknown>;
};

export type AssistantReply = {
  status: "done" | "unavailable" | "error" | "max_steps" | "max_tokens" | "refusal";
  text: string;
  proposals: AssistantProposal[];
  tools: Array<{ name: string; ok: boolean }>;
};

const askSchema = z.object({
  sessionId: z.uuid(),
  lines: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(8000) }))
    .min(1)
    .max(60),
  page: z.string().max(500).nullable().default(null),
});

export const askAdminAssistant = adminAction(askSchema, {}, async (input, ctx) => {
  if (!can(ctx.user.role, "admin.assistant"))
    throw new ActionError("You cannot use the assistant.", "FORBIDDEN");
  const db = await getDb();
  const run = await runAdminTurn({
    db,
    admin: ctx,
    lines: input.lines,
    page: input.page,
    sessionId: input.sessionId,
  });
  const inputs = new Map(
    run.toolCalls
      .filter((c) => c.actionId)
      .map((c) => [c.actionId!, c.input as Record<string, unknown>]),
  );
  const reply: AssistantReply = {
    status: run.status,
    text:
      run.status === "unavailable"
        ? (run.unavailable?.message ?? "The assistant is not available.")
        : run.status === "error"
          ? "The assistant did not answer. Please try again in a moment."
          : run.text,
    proposals: run.proposals.map((p) => ({ ...p, input: inputs.get(p.id) ?? {} })),
    tools: run.toolCalls.map((c) => ({ name: c.name, ok: c.ok })),
  };
  return reply;
});

const decideSchema = z.object({
  id: z.uuid(),
  /** Confirm with the admin's edits to the proposed input. */
  input: z.record(z.string(), z.unknown()).optional(),
});

function asActionError(err: unknown): never {
  if (err instanceof AiActionError)
    throw new ActionError(err.message, err.code === "NOT_FOUND" ? "NOT_FOUND" : "VALIDATION");
  throw err;
}

export const confirmAssistantProposal = adminAction(
  decideSchema,
  { write: true },
  async ({ id, input }, ctx) => {
    try {
      const res = await confirmAction(id, ctx, { tools: adminWriteTools, editedInput: input });
      return {
        id: res.id,
        status: res.status,
        result: res.result as Record<string, unknown> | null,
      };
    } catch (err) {
      asActionError(err);
    }
  },
);

export const rejectAssistantProposal = adminAction(
  z.object({ id: z.uuid() }),
  { write: true },
  async ({ id }, ctx) => {
    try {
      await rejectAction(id, ctx);
      return { id, status: "rejected" as const };
    } catch (err) {
      asActionError(err);
    }
  },
);
