import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DbOrTx } from "@/db/client";
import { emailLog } from "@/db/schema/system";
import { loadSettings } from "@/features/settings/queries";
import { getSecret } from "@/features/settings/secrets";
import { enqueue } from "@/jobs/enqueue";
import { defineJob } from "@/jobs/types";
import { newId } from "@/lib/ids";

export type OutgoingEmail = {
  to: string;
  subject: string;
  /** Template name, for the log and reports (e.g. "auth.verify-email"). */
  template: string;
  html: string;
  text: string;
  replyTo?: string;
  related?: { type: string; id: string };
};

/**
 * Logs the email and queues `email.send` (13 §2: sending is a job with retries and stored
 * status). Returns the email log id.
 */
export async function queueEmail(email: OutgoingEmail, db?: DbOrTx): Promise<string> {
  const conn = db ?? (await getDb());
  const id = newId();
  await conn.insert(emailLog).values({
    id,
    to: email.to.toLowerCase(),
    subject: email.subject,
    template: email.template,
    html: email.html,
    text: email.text,
    status: "queued",
    provider: "mock",
    relatedType: email.related?.type ?? null,
    relatedId: email.related?.id ?? null,
  });
  await enqueue(
    "email.send",
    { emailId: id, replyTo: email.replyTo ?? null },
    { db: conn, dedupeKey: `email:${id}` },
  );
  return id;
}

type ResendConfig = { apiKey: string; from: string; replyTo: string | null };

async function resendConfig(db: DbOrTx): Promise<ResendConfig | null> {
  const integrations = await loadSettings("integrations", db);
  if (!integrations.resend.enabled || !integrations.resend.fromAddress) return null;
  const apiKey = await getSecret("resend_api_key", db);
  if (!apiKey) return null;
  const name = integrations.resend.fromName || (await loadSettings("general", db)).agencyName;
  return {
    apiKey,
    from: `${name.replace(/[<>"]/g, "")} <${integrations.resend.fromAddress}>`,
    replyTo: integrations.resend.replyTo || null,
  };
}

/** Resend HTTP API. The email log id is the idempotency key, so retries never double-send. */
async function sendWithResend(
  config: ResendConfig,
  idempotencyKey: string,
  email: {
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo: string | null;
  },
): Promise<string> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: config.from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      reply_to: email.replyTo ?? config.replyTo ?? undefined,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !body.id)
    throw new Error(`Resend ${res.status}: ${body.message ?? "unknown error"}`);
  return body.id;
}

export const emailSendJob = defineJob({
  name: "email.send",
  payload: z.object({ emailId: z.uuid(), replyTo: z.string().nullable().default(null) }),
  maxAttempts: 5,
  async run({ emailId, replyTo }, { db, log }) {
    const [row] = await db.select().from(emailLog).where(eq(emailLog.id, emailId)).limit(1);
    if (!row) return { skipped: "missing" };
    if (row.status === "sent" || row.status === "mocked") return { skipped: row.status };

    const config = await resendConfig(db);
    if (!config) {
      // No provider configured (development, demo, tests): keep the email in the log only.
      await db
        .update(emailLog)
        .set({ status: "mocked", provider: "mock", sentAt: new Date(), error: null })
        .where(eq(emailLog.id, emailId));
      log("email mocked (no provider)", { template: row.template, to: row.to });
      return { provider: "mock" };
    }
    try {
      const providerId = await sendWithResend(config, emailId, {
        to: row.to,
        subject: row.subject,
        html: row.html ?? "",
        text: row.text ?? "",
        replyTo,
      });
      await db
        .update(emailLog)
        .set({ status: "sent", provider: "resend", providerId, sentAt: new Date(), error: null })
        .where(eq(emailLog.id, emailId));
      return { provider: "resend", providerId };
    } catch (err) {
      await db
        .update(emailLog)
        .set({ status: "failed", provider: "resend", error: (err as Error).message.slice(0, 1000) })
        .where(eq(emailLog.id, emailId));
      throw err;
    }
  },
});
