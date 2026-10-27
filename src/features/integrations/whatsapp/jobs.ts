import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db/client";
import { contacts, conversations, messages } from "@/db/schema/crm";
import { jobRuns } from "@/db/schema/system";
import { insideWindow, templateParameters, waId } from "@/features/inbox/rules";
import { loadSettings } from "@/features/settings/queries";
import { enqueue } from "@/jobs/enqueue";
import { defineJob } from "@/jobs/types";
import { NOT_CONFIGURED, WhatsappApiError, whatsappClient } from "./client";

const MAX_ATTEMPTS = 5;

const templateSchema = z.object({
  key: z.string(),
  name: z.string().min(1),
  language: z.string().min(1),
  parameters: z.array(z.string()),
});

async function fail(db: DbOrTx, messageId: string, error: string) {
  await db
    .update(messages)
    .set({ status: "failed", error: error.slice(0, 500) })
    .where(eq(messages.id, messageId));
}

/**
 * Delivers one queued WhatsApp message (13 §2 `whatsapp.send`): free text inside the 24-hour
 * window, the approved template outside it, or a listing photo with its caption. Stores the
 * WhatsApp id (statuses arrive by webhook) or the reason it was not sent.
 */
export const whatsappSendJob = defineJob({
  name: "whatsapp.send",
  payload: z.object({
    messageId: z.uuid(),
    template: templateSchema.nullable().default(null),
    image: z.object({ link: z.url(), caption: z.string() }).nullable().default(null),
  }),
  maxAttempts: MAX_ATTEMPTS,
  async run({ messageId, template, image }, { db, attempt }) {
    const [msg] = await db.select().from(messages).where(eq(messages.id, messageId));
    if (!msg) return { skipped: "missing" };
    if (msg.status !== "queued") return { skipped: msg.status };
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, msg.conversationId));
    const [contact] = conv?.contactId
      ? await db.select().from(contacts).where(eq(contacts.id, conv.contactId))
      : [];
    const number = conv?.externalId || contact?.whatsapp || contact?.phone;
    if (!conv || !number) {
      await fail(db, messageId, "No WhatsApp number for this conversation.");
      return { failed: "no number" };
    }
    const client = await whatsappClient(db);
    if (!client) {
      await fail(db, messageId, NOT_CONFIGURED);
      return { failed: "not configured" };
    }
    if (!template && !insideWindow(conv.waWindowExpiresAt, new Date())) {
      await fail(
        db,
        messageId,
        "Not sent: more than 24 hours since their last message, so only an approved template can go.",
      );
      return { failed: "outside window" };
    }
    try {
      const to = waId(number);
      const sent = template
        ? await client.sendTemplate(to, template)
        : image
          ? await client.sendImage(to, image)
          : await client.sendText(to, msg.body);
      await db
        .update(messages)
        .set({ status: "sent", externalId: sent.id, error: null })
        .where(eq(messages.id, messageId));
      return { sent: sent.id };
    } catch (err) {
      const message = (err as Error).message;
      if ((err instanceof WhatsappApiError && err.permanent) || attempt >= MAX_ATTEMPTS) {
        await fail(db, messageId, message);
        return { failed: message };
      }
      await db
        .update(messages)
        .set({ error: message.slice(0, 500) })
        .where(eq(messages.id, messageId));
      throw err;
    }
  },
});

/**
 * A notice to the team (13 §3 "agent new-lead notice", "lead not answered"): business-started,
 * so always the approved template mapped to `key` in Settings -> Integrations; without one it
 * is skipped with the reason in the job log.
 */
export const whatsappNotifyJob = defineJob({
  name: "whatsapp.notify",
  payload: z.object({
    to: z.string().min(6),
    key: z.string().min(1),
    vars: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  }),
  maxAttempts: MAX_ATTEMPTS,
  async run({ to, key, vars }, { db }) {
    const client = await whatsappClient(db);
    if (!client) return { skipped: "not configured" };
    const mapping = (await loadSettings("integrations", db)).whatsapp.templates[key];
    if (!mapping?.name) return { skipped: `no approved template mapped to ${key}` };
    try {
      const sent = await client.sendTemplate(waId(to), {
        name: mapping.name,
        language: mapping.language || "en",
        parameters: templateParameters(mapping.variables, vars),
      });
      return { sent: sent.id };
    } catch (err) {
      if (err instanceof WhatsappApiError && err.permanent) return { failed: err.message };
      throw err;
    }
  },
});

/** Queues a team notice once per `dedupeKey`, ever (a retried lead job must not send twice). */
export async function queueWhatsappNotice(
  db: DbOrTx,
  input: {
    to: string;
    key: string;
    vars: Record<string, string | number | null>;
    dedupeKey: string;
  },
) {
  const [earlier] = await db
    .select({ id: jobRuns.id })
    .from(jobRuns)
    .where(and(eq(jobRuns.name, "whatsapp.notify"), eq(jobRuns.dedupeKey, input.dedupeKey)))
    .limit(1);
  if (earlier) return null;
  return enqueue(
    "whatsapp.notify",
    { to: input.to, key: input.key, vars: input.vars },
    { db, dedupeKey: input.dedupeKey },
  );
}
