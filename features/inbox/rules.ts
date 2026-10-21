/**
 * Inbox rules that the composer and the server share (09 §6, 13 §1). Pure and client-safe.
 */

/** WhatsApp's customer service window: 24 hours from the customer's last message. */
export const WA_WINDOW_MS = 24 * 60 * 60 * 1000;

export function windowExpiry(lastInbound: Date): Date {
  return new Date(lastInbound.getTime() + WA_WINDOW_MS);
}

export function insideWindow(expiresAt: Date | string | null | undefined, now: Date): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() > now.getTime();
}

/**
 * Free text inside the window; outside it WhatsApp only delivers approved templates, so the
 * composer switches to template mode. Web chat and email always take free text.
 */
export function composerMode(
  channel: "web_chat" | "whatsapp" | "email",
  expiresAt: Date | string | null | undefined,
  now: Date,
): "text" | "template" {
  return channel === "whatsapp" && !insideWindow(expiresAt, now) ? "template" : "text";
}

/**
 * Parameters for an approved template, in the order it was approved with (Settings ->
 * Integrations maps each of our template keys to its name, language and variables). WhatsApp
 * refuses empty parameters, so a missing value is sent as a dash.
 */
export function templateParameters(
  variables: readonly string[],
  vars: Record<string, string | number | null | undefined>,
): string[] {
  return variables.map((name) => {
    const value = vars[name];
    const text = value === null || value === undefined ? "" : String(value).trim();
    // WhatsApp also refuses new lines, tabs and more than four spaces in a parameter.
    return (
      text
        .replace(/[\n\t]+/g, " ")
        .replace(/ {4,}/g, "   ")
        .slice(0, 1000) || "-"
    );
  });
}

/** Replies to lead emails come back to lead+<id>@<inbound domain> (13 §1 "Inbound email"). */
export function leadReplyAddress(leadId: string, inboundDomain: string): string | null {
  const domain = inboundDomain.trim().replace(/^@/, "").toLowerCase();
  return domain ? `lead+${leadId}@${domain}` : null;
}

/** The lead id in a lead+<id>@<domain> address, or null. */
export function leadIdFromAddress(address: string, inboundDomain: string): string | null {
  const domain = inboundDomain.trim().replace(/^@/, "").toLowerCase();
  const m = /^lead\+([0-9a-f-]{36})@(.+)$/i.exec(address.trim().toLowerCase());
  return m && domain && m[2] === domain ? m[1]! : null;
}

/** "Sam <sam@example.com>" -> { name: "Sam", email: "sam@example.com" }. */
export function parseAddress(value: string): { name: string | null; email: string } | null {
  const angle = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(value);
  const email = (angle ? angle[2]! : value).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const name = angle?.[1]?.trim() || null;
  return { name, email };
}

/** "+971 50 123 4567" -> "971501234567" (WhatsApp ids are digits only). */
export const waId = (phone: string) => phone.replace(/\D/g, "");

/** A WhatsApp id back to E.164. */
export const e164FromWaId = (id: string) => `+${waId(id)}`;
