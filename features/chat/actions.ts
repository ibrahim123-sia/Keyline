"use server";

import { getDb } from "@/db/client";
import { currentVisitorKey } from "@/features/attribution/current";
import { addIncoming, ensureConversation } from "@/features/inbox/store";
import { captureLead } from "@/features/leads/capture";
import { loadSettings } from "@/features/settings/queries";
import { errorsByPath, toActionError, type ActionResult } from "@/lib/actions";
import { hit, rateLimitRules } from "@/lib/rate-limit";
import { currentRequestMeta } from "@/lib/request";
import { chatMessageSchema, chatStartSchema, type ChatStartInput } from "./schema";
import { chatVisitor, visitorChat } from "./store";

type Fail = Extract<ActionResult<never>, { ok: false }>;
const off: Fail = { ok: false, error: "Chat is not available right now.", code: "OFF" };
const noVisitor: Fail = {
  ok: false,
  error: "Please reload the page and try again.",
  code: "NO_VISITOR",
};

async function limited(visitorKey: string): Promise<Fail | null> {
  const db = await getDb();
  const ip = (await currentRequestMeta()).ip ?? "unknown";
  const minute = await hit(`chat:${ip}`, rateLimitRules.chatMinute, db);
  const day = await hit(`chat-day:${visitorKey}`, rateLimitRules.chatDay, db);
  return minute.allowed && day.allowed
    ? null
    : {
        ok: false,
        error: "Too many messages in a short time. Please wait a minute.",
        code: "RATE_LIMITED",
      };
}

/**
 * Starts the website chat (09 §1 #3): with name and email or phone it becomes (or joins) a
 * lead with source chat; the conversation waits in the inbox for a person (Phase 9 adds the
 * assistant). Bots that fill the honeypot get a success answer and nothing happens.
 */
export async function startChat(
  input: ChatStartInput,
): Promise<ActionResult<{ conversationId: string }>> {
  try {
    const parsed = chatStartSchema.safeParse(input);
    if (!parsed.success) {
      const { fieldErrors, formErrors } = errorsByPath(parsed.error);
      return {
        ok: false,
        error: formErrors[0] ?? "Please check the highlighted fields.",
        code: "VALIDATION",
        fieldErrors,
      };
    }
    const data = parsed.data;
    if (data.website) return { ok: true, data: { conversationId: "" } };
    const db = await getDb();
    const { webChat } = await loadSettings("ai", db);
    if (!webChat.enabled) return off;
    const key = await currentVisitorKey();
    if (!key) return noVisitor;
    const blocked = await limited(key);
    if (blocked) return blocked;
    const hasContact = Boolean(data.email || data.phone);
    if (webChat.askContactFirst && (data.name.length < 2 || !hasContact))
      return {
        ok: false,
        error: "Please check the highlighted fields.",
        code: "VALIDATION",
        fieldErrors: {
          ...(data.name.length < 2 ? { name: ["Enter your name"] } : {}),
          ...(!hasContact
            ? { email: ["Enter an email address or a phone number so we can reply"] }
            : {}),
        },
      };

    const visitorId = await chatVisitor(db, key);
    const now = new Date();
    const lead = hasContact
      ? await captureLead(db, {
          source: "chat",
          contact: {
            name: data.name || data.email || data.phone,
            email: data.email || null,
            phone: data.phone || null,
          },
          message: data.message,
          visitorKey: key,
          eventType: "chat",
          now,
        })
      : null;
    const conv = await ensureConversation(db, {
      channel: "web_chat",
      contactId: lead?.contactId ?? null,
      leadId: lead?.leadId ?? null,
      visitorId,
      externalId: visitorId,
      status: "needs_human",
      now,
    });
    await addIncoming(db, {
      conversationId: conv.id,
      body: data.message,
      at: now,
      leadEvent: !lead,
    });
    return { ok: true, data: { conversationId: conv.id } };
  } catch (err) {
    return toActionError(err);
  }
}

/** A further message in the visitor's open chat. */
export async function sendChatMessage(input: {
  text: string;
  website?: string;
}): Promise<ActionResult<{ ok: true }>> {
  try {
    const parsed = chatMessageSchema.safeParse(input);
    if (!parsed.success) {
      const { fieldErrors, formErrors } = errorsByPath(parsed.error);
      return {
        ok: false,
        error: formErrors[0] ?? "Please check your message.",
        code: "VALIDATION",
        fieldErrors,
      };
    }
    if (parsed.data.website) return { ok: true, data: { ok: true } };
    const db = await getDb();
    if (!(await loadSettings("ai", db)).webChat.enabled) return off;
    const key = await currentVisitorKey();
    if (!key) return noVisitor;
    const blocked = await limited(key);
    if (blocked) return blocked;
    const conv = await visitorChat(db, await chatVisitor(db, key));
    if (!conv)
      return { ok: false, error: "This chat has ended. Start a new one.", code: "NO_CHAT" };
    await addIncoming(db, { conversationId: conv.id, body: parsed.data.text, at: new Date() });
    return { ok: true, data: { ok: true } };
  } catch (err) {
    return toActionError(err);
  }
}
