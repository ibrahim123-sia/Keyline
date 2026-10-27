/**
 * Click-to-WhatsApp reference codes (13 §1): the pre-filled message ends with
 * "[HD-2041·k3f9]" (what it is about and a code for this click), so the first message that
 * arrives can be matched to the visitor and the listing. Client-safe.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function newRefCode(length = 4): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** The wa.me link with "[label·code]" added to its message. */
export function withRefCode(href: string, label: string, code: string): string {
  const url = new URL(href);
  const text = url.searchParams.get("text") ?? "";
  const tag = `[${label.replace(/[[\]·]/g, "").slice(0, 40)}·${code}]`;
  return `${url.origin}${url.pathname}?text=${encodeURIComponent(text ? `${text} ${tag}` : tag)}`;
}

/** The reference in an incoming message, if it has one. */
export function findRefCode(message: string): { label: string; code: string } | null {
  const m = message.match(/\[([^[\]·]{1,40})·([a-z0-9]{4,8})\]/i);
  return m ? { label: m[1]!.trim(), code: m[2]!.toLowerCase() } : null;
}
