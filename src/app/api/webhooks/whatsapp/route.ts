import { getDb } from "@/db/client";
import { verifyHubSignature } from "@/features/integrations/signatures";
import {
  handleWhatsappWebhook,
  whatsappWebhookSchema,
} from "@/features/integrations/whatsapp/inbound";
import { getSecret } from "@/features/settings/secrets";
import { timingSafeEqual } from "@/lib/crypto";

/**
 * WhatsApp Cloud API webhook (13 §1). GET: Meta's subscription check with the verify token.
 * POST: messages and statuses, trusted only after the X-Hub-Signature-256 check with the app
 * secret.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const token = params.get("hub.verify_token");
  const expected = await getSecret("whatsapp_verify_token");
  if (
    params.get("hub.mode") === "subscribe" &&
    token &&
    expected &&
    timingSafeEqual(token, expected)
  )
    return new Response(params.get("hub.challenge") ?? "", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const db = await getDb();
  const secret = await getSecret("whatsapp_app_secret", db);
  if (!(await verifyHubSignature(raw, request.headers.get("x-hub-signature-256"), secret)))
    return new Response("Invalid signature", { status: 401 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Not JSON", { status: 400 });
  }
  const parsed = whatsappWebhookSchema.safeParse(body);
  if (!parsed.success) return new Response("Unexpected payload", { status: 400 });
  await handleWhatsappWebhook(db, parsed.data);
  return new Response("ok", { status: 200 });
}
