import { z } from "zod";
import { getDb } from "@/db/client";
import { applyEmailEvent, handleInboundEmail } from "@/features/integrations/email-inbound";
import { verifySvixSignature } from "@/features/integrations/signatures";
import { getSecret } from "@/features/settings/secrets";

const addressList = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : [v]));
const eventSchema = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z
    .object({
      email_id: z.string().optional(),
      message_id: z.string().optional(),
      from: z.string().optional(),
      to: addressList.optional(),
      cc: addressList.optional(),
      subject: z.string().optional(),
      text: z.string().nullable().optional(),
      html: z.string().nullable().optional(),
      bounce: z.object({ message: z.string().optional() }).loose().optional(),
    })
    .loose(),
});

/**
 * Resend webhook (13 §1): inbound email (`email.received`) into the inbox and lead timelines,
 * and bounces for email we sent. Trusted only after the Svix signature check.
 */
export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const db = await getDb();
  const ok = await verifySvixSignature(
    raw,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    await getSecret("resend_webhook_secret", db),
  );
  if (!ok) return new Response("Invalid signature", { status: 401 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Not JSON", { status: 400 });
  }
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) return new Response("Unexpected payload", { status: 400 });
  const { type, data, created_at } = parsed.data;

  if (type === "email.received") {
    if (!data.from || !data.to?.length) return new Response("Missing addresses", { status: 400 });
    const result = await handleInboundEmail(db, {
      from: data.from,
      to: data.to,
      cc: data.cc,
      subject: data.subject ?? "",
      text: data.text ?? null,
      html: data.html ?? null,
      messageId: data.message_id ?? data.email_id ?? null,
      receivedAt:
        created_at && !Number.isNaN(Date.parse(created_at)) ? new Date(created_at) : new Date(),
    });
    return Response.json({ ok: true, result: result.kind });
  }
  if (data.email_id) await applyEmailEvent(db, type, data.email_id, data.bounce?.message);
  return Response.json({ ok: true });
}
