/**
 * UUID v7 (RFC 9562): 48-bit Unix millisecond timestamp, version and variant bits,
 * 74 random bits. Ids sort by creation time, which keeps b-tree inserts cheap.
 *
 * Generated in app code (not by the database) so an id is known before insert:
 * audit entries, related rows and job payloads can reference it in the same step.
 */
export function newId(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Bytes 0-5: big-endian millisecond timestamp. Division keeps precision above 2^32.
  bytes[0] = Math.floor(now / 0x10000000000) & 0xff;
  bytes[1] = Math.floor(now / 0x100000000) & 0xff;
  bytes[2] = Math.floor(now / 0x1000000) & 0xff;
  bytes[3] = Math.floor(now / 0x10000) & 0xff;
  bytes[4] = Math.floor(now / 0x100) & 0xff;
  bytes[5] = now & 0xff;

  bytes[6] = 0x70 | (bytes[6]! & 0x0f); // version 7
  bytes[8] = 0x80 | (bytes[8]! & 0x3f); // RFC 4122 variant

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Milliseconds since epoch encoded in a UUID v7. */
export function idTimestamp(id: string): number {
  const hex = id.replaceAll("-", "").slice(0, 12);
  return Number.parseInt(hex, 16);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Short random token (URL-safe), e.g. for short links, ref codes and preview links. */
export function randomToken(length = 10): string {
  // 32 symbols (no l, o, 0, 1: easy to read aloud); a power of two, so `b % 32` has no bias.
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
