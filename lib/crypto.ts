/**
 * Web Crypto helpers that run unchanged in Node and Cloudflare Workers.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  return base64ToBytes(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

/** Constant-time string comparison (for tokens and signatures). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(data));
  return new Uint8Array(sig);
}

export async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  return bytesToHex(await hmacSha256(secret, data));
}

/* --------------------- Secrets at rest (AES-256-GCM) -------------------- */

const SECRET_VERSION = "v1";
let cachedKey: { raw: string; key: CryptoKey } | undefined;

async function encryptionKey(): Promise<CryptoKey> {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) throw new Error("SECRETS_ENCRYPTION_KEY is not set");
  if (cachedKey?.raw === raw) return cachedKey.key;
  const bytes = base64ToBytes(raw);
  if (bytes.length !== 32)
    throw new Error("SECRETS_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  const key = await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
  cachedKey = { raw, key };
  return key;
}

/** Returns `v1.<iv>.<ciphertext>` (base64url). A fresh random IV per value. */
export async function encryptSecret(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    encoder.encode(plaintext),
  );
  return `${SECRET_VERSION}.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ct))}`;
}

export async function decryptSecret(token: string): Promise<string> {
  const [version, ivPart, ctPart] = token.split(".");
  if (version !== SECRET_VERSION || !ivPart || !ctPart) throw new Error("Unknown secret format");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(ivPart) },
    await encryptionKey(),
    base64UrlToBytes(ctPart),
  );
  return decoder.decode(pt);
}

/** For display: never show more than the last 4 characters. */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  const tail = value.length > 8 ? value.slice(-4) : "";
  return `${"•".repeat(8)}${tail}`;
}
