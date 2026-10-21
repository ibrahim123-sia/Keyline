import "server-only";
import { env } from "@/lib/env";

/**
 * Cloudflare Turnstile on public forms (06 §10, 14 §2), checked on the server. Off when the
 * secret is "off" (automated tests); the widget is components/forms/turnstile.tsx.
 */
type Verifier = (token: string, ip: string | null, action?: string) => Promise<boolean>;

let override: Verifier | null = null;

/** Tests replace the network call (and so switch the check on). `null` restores the real one. */
export function setTurnstileVerifier(v: Verifier | null): void {
  override = v;
}

export function turnstileRequired(): boolean {
  const key = env().TURNSTILE_SECRET_KEY;
  return Boolean(key) && key !== "off";
}

const cloudflare: Verifier = async (token, ip, action) => {
  const body = new URLSearchParams({ secret: env().TURNSTILE_SECRET_KEY, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { success?: boolean; action?: string };
    return data.success === true && (!action || !data.action || data.action === action);
  } catch {
    return false;
  }
};

/** True when the form may go ahead: Turnstile is off, or the token checks out. */
export async function verifyTurnstile(
  token: string | null | undefined,
  ip: string | null,
  action?: string,
): Promise<boolean> {
  if (override) return token ? override(token, ip, action) : false;
  if (!turnstileRequired()) return true;
  if (!token) return false;
  return cloudflare(token, ip, action);
}
