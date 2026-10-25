import { z } from "zod";
import type { DbOrTx, Tx } from "@/db/client";
import type { AiActionSource, AiFeature } from "@/db/schema/ai";
import type { adminAiActions } from "@/features/settings/schema";
import type { AuditActor } from "@/lib/audit";
import type { AdminContext } from "@/lib/permissions";
import type { AiToolSpec, JsonSchema } from "../types";

/**
 * Typed tools for the assistants (10 §2, §3). A tool has a Zod input schema (sent to the model
 * as JSON Schema and checked again on our side before anything runs) and a kind:
 * - `read`: runs at once (lookups; also visitor actions the visitor confirmed in the chat,
 *   such as booking a viewing);
 * - `write`: admin changes. The model calling it never changes anything: the runner stores a
 *   proposal (`ai_actions`, status `proposed`) with a preview, and the change runs only when
 *   an admin confirms it (actions.ts).
 */

export type AiActor =
  | { type: "visitor"; visitorId: string | null; customerId?: string | null; ip?: string | null }
  | { type: "admin"; admin: AdminContext };

export type AiToolContext = {
  db?: DbOrTx;
  actor: AiActor;
  feature: AiFeature;
  /** Conversation (or MCP session) the call belongs to. */
  conversationRef?: string | null;
  source?: AiActionSource;
};

export type AdminAiAction = (typeof adminAiActions)[number];

/** What `execute` gets when an admin confirms a proposal. */
export type ConfirmContext = {
  db: Tx;
  admin: AdminContext;
  /** actor_type "ai" with the confirming admin: use it for the change's own audit entries. */
  auditActor: AuditActor;
  actionId: string;
};

type ToolBase<S extends z.ZodType> = {
  name: string;
  description: string;
  input: S;
};

export type ReadTool<S extends z.ZodType = z.ZodType> = ToolBase<S> & {
  kind: "read";
  run: (input: z.output<S>, ctx: AiToolContext) => Promise<unknown>;
};

export type WriteTool<S extends z.ZodType = z.ZodType> = ToolBase<S> & {
  kind: "write";
  /** The Settings -> AI checkbox that must be ticked for the assistant to propose it. */
  action?: AdminAiAction;
  /** How many people the change would message (more than 10 is refused, 10 §3). */
  recipients?: (input: z.output<S>) => number;
  /** Before/after diff, message text or the draft entity, shown on the preview card. */
  preview: (input: z.output<S>, ctx: AiToolContext) => Promise<Record<string, unknown>>;
  /** Re-checks on confirm that the admin may still do this (throw to refuse). */
  authorize?: (input: z.output<S>, ctx: ConfirmContext) => Promise<void>;
  /** Runs the change after confirmation, inside the confirm transaction. */
  execute: (input: z.output<S>, ctx: ConfirmContext) => Promise<unknown>;
};

export type AiTool<S extends z.ZodType = z.ZodType> = ReadTool<S> | WriteTool<S>;
// Lists of tools hold different schemas; the runner validates every input itself.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAiTool = AiTool<any>;

/* Hard blocks (10 §3 "Not allowed for AI"): in code, not only in the prompt ---------------- */

const BLOCKED_NAMES: Array<[RegExp, string]> = [
  [/(^|_)(delete|remove|destroy|purge|erase)(_|$)/, "deleting"],
  [/(^|_)(settings?|integrations?|branding|users?|admins?|tokens?)(_|$)/, "settings, users"],
  [/(^|_)export(_|$)/, "exporting data"],
  [/(^|_)(un)?publish(_|$)/, "publishing"],
  [/(^|_)bulk(_|$)/, "bulk changes"],
];

export const MAX_AI_RECIPIENTS = 10;

/** Why a tool may never be given to the AI, or null. */
export function blockedToolReason(name: string): string | null {
  for (const [pattern, what] of BLOCKED_NAMES)
    if (pattern.test(name)) return `AI tools may not do this (${what}).`;
  return null;
}

const TOOL_NAME = /^[a-z][a-z0-9_]{1,63}$/;

export function defineTool<S extends z.ZodType>(tool: ReadTool<S>): ReadTool<S>;
export function defineTool<S extends z.ZodType>(tool: WriteTool<S>): WriteTool<S>;
export function defineTool<S extends z.ZodType>(tool: AiTool<S>): AiTool<S> {
  if (!TOOL_NAME.test(tool.name)) throw new Error(`Bad AI tool name "${tool.name}"`);
  const blocked = blockedToolReason(tool.name);
  if (blocked) throw new Error(`AI tool "${tool.name}" is not allowed: ${blocked}`);
  return tool;
}

/** Strict JSON Schema for a tool input (no `$schema`, no extra properties). */
export function toolJsonSchema(schema: z.ZodType): JsonSchema {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema;
  delete json.$schema;
  if (json.type !== "object")
    throw new Error("An AI tool input must be an object schema (z.object).");
  return json;
}

export function toolSpec(tool: AnyAiTool): AiToolSpec {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: toolJsonSchema(tool.input),
  };
}

/** Zod issues as one short line for the model (it can fix its call). */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
    .join("; ");
}
