import "server-only";
import { and, asc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { conversations, leadEvents, leads, messages, type Requirements } from "@/db/schema/crm";
import { loadSettings } from "@/features/settings/queries";
import { enqueue } from "@/jobs/enqueue";
import { defineJob } from "@/jobs/types";
import { toMinor } from "@/lib/money";
import { checkAiAvailable } from "../limits";
import { prompt } from "../prompts";
import { registerMockRule } from "../providers/mock";
import { generateText, parseJsonReply } from "../runner";
import type { AiProvider } from "../types";
import { findLocations } from "./lookup";

/**
 * End of conversation (10 §2): after 15 minutes without a message, a chat the assistant took
 * part in gets a short summary for the agent, the requirements the visitor stated are added to
 * the lead (only what is not known yet), and the lead is scored again. A conversation that goes
 * on is summarised again after its next quiet spell.
 */

export const IDLE_MINUTES = 15;
const LOOKBACK_DAYS = 7;
const BATCH = 25;

const replySchema = z.object({
  summary: z.string().trim().min(1).max(1200),
  requirements: z
    .object({
      purpose: z.enum(["sale", "rent"]).optional().catch(undefined),
      budgetMin: z.number().positive().optional().catch(undefined),
      budgetMax: z.number().positive().optional().catch(undefined),
      areas: z.array(z.string().max(80)).max(8).optional().catch(undefined),
      bedsMin: z.number().int().min(0).max(20).optional().catch(undefined),
      timeline: z
        .enum(["now", "1_3_months", "3_6_months", "6_12_months", "later", "browsing"])
        .optional()
        .catch(undefined),
      finance: z.enum(["cash", "mortgage", "unknown"]).optional().catch(undefined),
      preApproved: z.boolean().optional().catch(undefined),
    })
    .default({}),
});

export type ConversationSummary = z.infer<typeof replySchema>;

/** The model's reply, or null when it is not usable. */
export function parseSummaryReply(text: string): ConversationSummary | null {
  const parsed = replySchema.safeParse(parseJsonReply(text));
  return parsed.success ? parsed.data : null;
}

const speaker = { customer: "Visitor", ai: "Assistant", admin: "Team", system: "Notice" } as const;

/** The transcript as the model reads it (escaped, so nothing in it can close the tag). */
export function transcriptText(lines: Array<{ sender: keyof typeof speaker; body: string }>) {
  return lines
    .filter((l) => l.body.trim())
    .map((l) => `${speaker[l.sender]}: ${l.body.slice(0, 1500)}`)
    .join("\n")
    .replace(/</g, "‹");
}

/** Stated requirements as lead fields; fields the lead already has are kept. */
export async function mergeRequirements(
  db: DbOrTx,
  current: Requirements,
  stated: ConversationSummary["requirements"],
): Promise<Requirements> {
  const market = await loadSettings("market", db);
  const decimals = market.baseCurrency.decimals;
  const next: Requirements = { ...current };
  if (stated.purpose && !next.purpose) next.purpose = stated.purpose;
  // A budget the lead stated beats one worked out from a listing.
  const ownBudget = next.budgetFrom === "lead" && (next.budgetMin || next.budgetMax);
  if (!ownBudget && (stated.budgetMin || stated.budgetMax)) {
    next.budgetMin = stated.budgetMin ? toMinor(stated.budgetMin, decimals) : null;
    next.budgetMax = stated.budgetMax ? toMinor(stated.budgetMax, decimals) : null;
    next.currency = market.baseCurrency.code;
    next.budgetFrom = "lead";
  }
  if (stated.areas?.length && !next.locationIds?.length) {
    const ids = (await findLocations(db, stated.areas)).map((l) => l.id);
    if (ids.length) next.locationIds = ids;
  }
  if (stated.bedsMin !== undefined && (next.bedsMin === undefined || next.bedsMin === null))
    next.bedsMin = stated.bedsMin;
  if (stated.timeline && !next.timeline) next.timeline = stated.timeline;
  if (stated.finance && (!next.finance || next.finance === "unknown"))
    next.finance = stated.finance;
  return next;
}

/** The test provider's summary: the visitor's first words, no requirements (development). */
function registerSummaryMockRule() {
  registerMockRule({
    name: "conversation-summary",
    reply(ctx) {
      if (!ctx.request.system.includes("You summarise conversations")) return null;
      const first = /Visitor: (.*)/.exec(ctx.lastUserText)?.[1] ?? "";
      return {
        text: JSON.stringify({
          summary: `The visitor wrote: "${first.slice(0, 160)}".`,
          requirements: {},
        }),
      };
    },
  });
}

export type SummaryOutcome =
  | { status: "summarised"; summary: string; leadId: string | null }
  | { status: "skipped"; reason: string };

export async function summariseConversation(
  db: DbOrTx,
  conversationId: string,
  options: { now?: Date; provider?: AiProvider } = {},
): Promise<SummaryOutcome> {
  const now = options.now ?? new Date();
  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.agencyId, currentAgencyId())),
    );
  if (!conv) return { status: "skipped", reason: "missing" };
  if (conv.aiSummaryAt && conv.lastMessageAt && conv.aiSummaryAt >= conv.lastMessageAt)
    return { status: "skipped", reason: "up_to_date" };
  const lines = await db
    .select({ sender: messages.sender, body: messages.body })
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .limit(120);
  if (!lines.some((l) => l.sender === "customer"))
    return { status: "skipped", reason: "no_visitor_message" };

  const general = await loadSettings("general", db);
  registerSummaryMockRule();
  const run = await generateText({
    feature: "summary",
    system: prompt("conversation-summary", { agencyName: general.agencyName }),
    user: `<transcript>\n${transcriptText(lines)}\n</transcript>`,
    maxTokens: 800,
    effort: "low",
    db,
    provider: options.provider,
    now,
  });
  if (run.status !== "done") return { status: "skipped", reason: run.status };
  const reply = parseSummaryReply(run.text);
  if (!reply) return { status: "skipped", reason: "bad_reply" };

  await db
    .update(conversations)
    .set({ aiSummary: reply.summary, aiSummaryAt: now })
    .where(eq(conversations.id, conv.id));
  if (conv.leadId) {
    const [lead] = await db
      .select({ id: leads.id, requirements: leads.requirements })
      .from(leads)
      .where(eq(leads.id, conv.leadId));
    if (lead) {
      const requirements = await mergeRequirements(db, lead.requirements, reply.requirements);
      await db.update(leads).set({ requirements }).where(eq(leads.id, lead.id));
      await db.insert(leadEvents).values({
        leadId: lead.id,
        type: "ai_summary",
        body: reply.summary,
        meta: {
          conversationId: conv.id,
          requirements: reply.requirements,
          ...(reply.requirements.preApproved ? { preApproved: true } : {}),
        },
        actorType: "ai",
        createdAt: now,
      });
      await enqueue("lead.score", { leadId: lead.id }, { db, dedupeKey: `lead.score:${lead.id}` });
    }
  }
  return { status: "summarised", summary: reply.summary, leadId: conv.leadId };
}

export const conversationSummaryJob = defineJob({
  name: "ai.conversation_summary",
  payload: z.object({ conversationId: z.uuid() }),
  maxAttempts: 3,
  run: ({ conversationId }, { db }) => summariseConversation(db, conversationId),
});

/**
 * Every 5 minutes: chats and WhatsApp conversations the assistant answered in, quiet for 15
 * minutes and not summarised since their last message. Nothing when summaries are off.
 */
export async function queueIdleSummaries(db: DbOrTx, now = new Date()): Promise<number> {
  if (!(await checkAiAvailable("summary", { db, now })).ok) return 0;
  const quietSince = new Date(now.getTime() - IDLE_MINUTES * 60_000);
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  const rows = await db
    .select({ id: conversations.id, lastMessageAt: conversations.lastMessageAt })
    .from(conversations)
    .where(
      and(
        eq(conversations.agencyId, currentAgencyId()),
        inArray(conversations.channel, ["web_chat", "whatsapp"]),
        lt(conversations.lastMessageAt, quietSince),
        gt(conversations.lastMessageAt, from),
        or(
          isNull(conversations.aiSummaryAt),
          lt(conversations.aiSummaryAt, conversations.lastMessageAt),
        ),
        sql`exists (select 1 from ${messages} m where m.conversation_id = ${conversations.id} and m.sender = 'ai')`,
      ),
    )
    .limit(BATCH);
  let queued = 0;
  for (const row of rows) {
    const id = await enqueue(
      "ai.conversation_summary",
      { conversationId: row.id },
      { db, dedupeKey: `ai.summary:${row.id}:${row.lastMessageAt!.getTime()}` },
    );
    if (id) queued += 1;
  }
  return queued;
}
