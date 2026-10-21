import { getDb } from "@/db/client";
import {
  verifyGoogleKey,
  verifyHubSignature,
  verifyTiktokSignature,
} from "@/features/integrations/signatures";
import { loadSettings } from "@/features/settings/queries";
import { getSecret } from "@/features/settings/secrets";
import { captureSocialLead, fetchMetaLead, metaLead } from "@/features/social-forms/capture";
import {
  googleLead,
  metaLeadgenEvents,
  tiktokLeads,
  type SocialSource,
} from "@/features/social-forms/parse";
import { timingSafeEqual } from "@/lib/crypto";

const sources = ["meta", "tiktok", "google"] as const;
const isSource = (s: string): s is SocialSource => (sources as readonly string[]).includes(s);

/** Meta's subscription check (hub.verify_token = the Meta verify token in Settings). */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/webhooks/leads/[source]">,
): Promise<Response> {
  const { source } = await ctx.params;
  if (source !== "meta") return new Response("Not found", { status: 404 });
  const params = new URL(request.url).searchParams;
  const token = params.get("hub.verify_token");
  const expected = await getSecret("social_meta_secret");
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

/**
 * Lead form webhooks (09 §1 #18, 13 §1): Meta Lead Ads, TikTok and Google Ads. Each call is
 * checked first (Meta: X-Hub-Signature-256 with the app secret; TikTok: HMAC with its secret;
 * Google: the key in the body), only when that source is turned on in Settings.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/webhooks/leads/[source]">,
): Promise<Response> {
  const { source } = await ctx.params;
  if (!isSource(source)) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const { socialForms } = await loadSettings("integrations", db);
  if (!socialForms[source]) return new Response("This lead source is turned off", { status: 404 });
  const raw = await request.text();

  if (source === "meta") {
    const ok = await verifyHubSignature(
      raw,
      request.headers.get("x-hub-signature-256"),
      await getSecret("social_meta_app_secret", db),
    );
    if (!ok) return new Response("Invalid signature", { status: 401 });
  } else if (source === "tiktok") {
    const header =
      request.headers.get("x-tiktok-signature") ?? request.headers.get("tiktok-signature");
    if (!(await verifyTiktokSignature(raw, header, await getSecret("social_tiktok_secret", db))))
      return new Response("Invalid signature", { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return new Response("Not JSON", { status: 400 });
  }
  if (
    source === "google" &&
    !verifyGoogleKey(
      typeof body.google_key === "string" ? body.google_key : null,
      await getSecret("social_google_secret", db),
    )
  )
    return new Response("Invalid key", { status: 401 });

  let captured = 0;
  let skipped = 0;
  const count = (r: { skipped?: string }) => (r.skipped ? skipped++ : captured++);
  if (source === "google") {
    const lead = googleLead(body);
    if (!lead) return new Response("No lead", { status: 400 });
    count(await captureSocialLead(db, "google", lead));
  } else if (source === "tiktok") {
    for (const lead of tiktokLeads(body)) count(await captureSocialLead(db, "tiktok", lead));
  } else {
    for (const event of metaLeadgenEvents(body)) {
      // Answers come inline (test leads) or from the Graph API with the page token.
      const details = Array.isArray(event.fieldData)
        ? { field_data: event.fieldData }
        : await fetchMetaLead(db, event.leadgenId);
      if (!details) {
        console.error(
          "[lead forms] Meta lead without answers: add the page access token",
          event.leadgenId,
        );
        skipped++;
        continue;
      }
      count(await captureSocialLead(db, "meta", metaLead(event.leadgenId, details, event)));
    }
  }
  return Response.json({ ok: true, captured, skipped });
}
