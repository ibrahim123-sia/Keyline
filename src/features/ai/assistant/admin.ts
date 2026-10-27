import "server-only";
import type { DbOrTx } from "@/db/client";
import { loadSettings } from "@/features/settings/queries";
import type { AdminContext } from "@/lib/permissions";
import { prompt } from "../prompts";
import { runAgent, type RunAgentResult } from "../runner";
import type { AnyAiTool } from "../tools/registry";
import type { AiMessage, AiProvider } from "../types";
import { adminReadTools } from "./admin-read-tools";
import { registerAdminMockRules } from "./admin-mock";
import { adminWriteTools } from "./admin-write-tools";

/**
 * The admin assistant (10 §3): ask (read tools), suggest (it points out what it notices) and
 * act (write tools that only propose; the admin confirms on the preview card). The history is
 * the panel's, sent with each question; proposals live in `ai_actions`.
 */

export type AdminTurnLine = { role: "user" | "assistant"; text: string };

const actionLabels: Record<string, string> = {
  create_listing_draft: "create a listing draft",
  update_listing: "change a listing's price, status, featured flag or agent",
  write_listing_copy: "write a listing's description, highlights and SEO texts",
  draft_blog_post: "draft a blog post",
  send_lead_reply: "send a reply to a lead",
  manage_viewing: "book, move or cancel a viewing",
  create_task: "create a task",
  update_lead: "move a lead's stage or assign an agent",
  create_utm_link: "create a campaign link",
  send_listings_to_lead: "send listings to a lead",
};

/** Read tools, and the write tools whose Settings -> AI checkbox is ticked. */
export async function adminTools(db: DbOrTx): Promise<AnyAiTool[]> {
  const { allowedActions } = await loadSettings("ai", db);
  return [
    ...adminReadTools,
    ...adminWriteTools.filter((t) => t.kind === "write" && (!t.action || allowedActions[t.action])),
  ];
}

export async function adminSystemPrompt(db: DbOrTx, admin: AdminContext, tools: AnyAiTool[]) {
  const general = await loadSettings("general", db);
  const allowed = tools
    .filter((t) => t.kind === "write")
    .map((t) => actionLabels[t.name] ?? t.name);
  return prompt("admin-system", {
    agencyName: general.agencyName,
    adminName: admin.user.name,
    allowedActions: allowed.length ? allowed : ["nothing (all actions are turned off)"],
  });
}

/** What the admin is looking at, from the admin address. */
export function adminPageContext(path: string | null | undefined): string {
  if (!path) return "(not known)";
  const id = /\/admin\/(leads|properties|projects|viewings|inbox)\/([0-9a-f-]{36})/i.exec(path);
  if (id?.[1] === "leads") return `the lead ${id[2]} (use get_lead)`;
  if (id?.[1] === "properties") return `the listing ${id[2]} (use get_listing with this id)`;
  return `the admin page ${path.slice(0, 200)}`;
}

export function adminHistory(lines: AdminTurnLine[]): AiMessage[] {
  const out: AiMessage[] = [];
  for (const line of lines.slice(-30)) {
    if (!line.text.trim()) continue;
    const last = out.at(-1);
    if (last?.role === line.role) last.content.push({ type: "text", text: line.text });
    else out.push({ role: line.role, content: [{ type: "text", text: line.text }] });
  }
  while (out[0] && out[0].role !== "user") out.shift();
  return out;
}

export async function runAdminTurn(options: {
  db: DbOrTx;
  admin: AdminContext;
  lines: AdminTurnLine[];
  page?: string | null;
  sessionId: string;
  now?: Date;
  provider?: AiProvider;
}): Promise<RunAgentResult> {
  registerAdminMockRules();
  const history = adminHistory(options.lines);
  const last = history.at(-1);
  if (!last || last.role !== "user") throw new Error("The last turn must be the admin's.");
  const general = await loadSettings("general", options.db);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: general.timeZone }).format(
    options.now ?? new Date(),
  );
  last.content.unshift({
    type: "text",
    text: `<context>\nToday: ${today} (${general.timeZone})\nThe admin is looking at: ${adminPageContext(options.page)}\n</context>`,
  });
  const tools = await adminTools(options.db);
  return runAgent({
    feature: "admin_chat",
    tier: "chat",
    system: await adminSystemPrompt(options.db, options.admin, tools),
    messages: history,
    tools,
    context: {
      actor: { type: "admin", admin: options.admin },
      conversationRef: options.sessionId,
      source: "admin_chat",
    },
    maxSteps: 8,
    maxTokens: 4096,
    db: options.db,
    provider: options.provider,
    now: options.now,
  });
}
