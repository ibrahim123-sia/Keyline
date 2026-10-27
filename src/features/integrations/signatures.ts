import { base64ToBytes, bytesToBase64, hmacSha256Hex, timingSafeEqual } from "@/lib/crypto";

/**
 * Webhook signature checks (13 §1: every webhook verifies its sender before the body is
 * trusted). Web Crypto only, so they run unchanged in Node and Cloudflare Workers.
 */

/**
 * Meta (WhatsApp Cloud API, Lead Ads): `X-Hub-Signature-256: sha256=<hex>`, an HMAC-SHA256 of
 * the raw body with the app secret.
 */
export async function verifyHubSignature(
  rawBody: string,
  header: string | null | undefined,
  appSecret: string | null | undefined,
): Promise<boolean> {
  if (!header || !appSecret) return false;
  const [scheme, signature] = header.trim().split("=", 2);
  if (scheme !== "sha256" || !signature) return false;
  return timingSafeEqual(await hmacSha256Hex(appSecret, rawBody), signature.toLowerCase());
}

/** Resend webhooks are signed by Svix: allowed clock difference either way. */
export const SVIX_TOLERANCE_SECONDS = 5 * 60;

/**
 * Resend (Svix): `svix-signature: v1,<base64> [v1,<base64> …]` over "<svix-id>.<svix-timestamp>.
 * <body>" with the key in the secret after "whsec_" (base64). Old timestamps are refused, so a
 * captured call cannot be replayed later.
 */
export async function verifySvixSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > SVIX_TOLERANCE_SECONDS) return false;
  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = base64ToBytes(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${headers.id}.${headers.timestamp}.${rawBody}`),
  );
  const expected = bytesToBase64(new Uint8Array(mac));
  return headers.signature
    .split(" ")
    .map((part) => part.split(",", 2))
    .some(([version, sig]) => version === "v1" && Boolean(sig) && timingSafeEqual(sig!, expected));
}

/**
 * TikTok lead webhooks: a hex HMAC-SHA256 with the shared secret, either of the raw body
 * ("<hex>" or "sha256=<hex>") or, in the timestamped form "t=<unix>,s=<hex>", of "<t>.<body>".
 */
export async function verifyTiktokSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!header || !secret) return false;
  const value = header.trim();
  const stamped = /^t=(\d+),s=([0-9a-f]+)$/i.exec(value);
  if (stamped) {
    const ts = Number(stamped[1]);
    if (Math.abs(nowMs / 1000 - ts) > SVIX_TOLERANCE_SECONDS) return false;
    return timingSafeEqual(
      await hmacSha256Hex(secret, `${stamped[1]}.${rawBody}`),
      stamped[2]!.toLowerCase(),
    );
  }
  const hex = value.replace(/^sha256=/i, "").toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) && timingSafeEqual(await hmacSha256Hex(secret, rawBody), hex);
}

/** Google Ads lead forms send the key set in Google Ads in the body (`google_key`). */
export function verifyGoogleKey(
  key: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  return Boolean(key && secret) && timingSafeEqual(key!, secret!);
}
