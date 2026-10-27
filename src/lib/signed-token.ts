import { base64UrlToBytes, bytesToBase64Url, hmacSha256, timingSafeEqual } from "@/lib/crypto";

/**
 * Short-lived signed tokens (upload links and similar): `<payload>.<signature>`, both
 * base64url. The purpose is part of the signed data, so a token made for one use can never
 * be replayed for another.
 */

function secret(): string {
  const s = process.env.BETTER_AUTH_SECRET || process.env.SECRETS_ENCRYPTION_KEY;
  if (!s) throw new Error("BETTER_AUTH_SECRET is not set");
  return s;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function signToken(
  purpose: string,
  payload: Record<string, unknown>,
  ttlSeconds: number,
): Promise<string> {
  const body = bytesToBase64Url(
    encoder.encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })),
  );
  const sig = bytesToBase64Url(await hmacSha256(secret(), `${purpose}.${body}`));
  return `${body}.${sig}`;
}

/** The payload, or null when the token is malformed, forged, for another purpose or expired. */
export async function verifyToken<T extends Record<string, unknown>>(
  purpose: string,
  token: string | null | undefined,
): Promise<T | null> {
  if (!token || token.length > 4096) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = bytesToBase64Url(await hmacSha256(secret(), `${purpose}.${body}`));
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(decoder.decode(base64UrlToBytes(body))) as T & { exp?: unknown };
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
