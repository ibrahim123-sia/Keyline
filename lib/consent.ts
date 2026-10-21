/**
 * Cookie consent (06 §2): necessary cookies are always on; analytics and marketing only after
 * the visitor agrees. Stored in one small cookie the server and the browser can both read.
 * Client-safe.
 */
export const CONSENT_COOKIE = "lintel_consent";
/** Fired on window when the visitor saves a choice. */
export const CONSENT_EVENT = "lintel:consent";
/** Fired to reopen the banner (the footer's "Cookie settings" link). */
export const COOKIE_SETTINGS_EVENT = "lintel:cookie-settings";
/** Ask again after six months. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 182;

export type ConsentCategory = "analytics" | "marketing";
export type Consent = { analytics: boolean; marketing: boolean; at: number };

/** "v1.a1.m0.1760000000" */
export function serializeConsent(c: Consent): string {
  return `v1.a${c.analytics ? 1 : 0}.m${c.marketing ? 1 : 0}.${Math.floor(c.at / 1000)}`;
}

export function parseConsent(value: string | null | undefined): Consent | null {
  const m = value?.match(/^v1\.a([01])\.m([01])\.(\d{1,12})$/);
  if (!m) return null;
  return { analytics: m[1] === "1", marketing: m[2] === "1", at: Number(m[3]) * 1000 };
}

/** The consent cookie out of a `document.cookie` string. */
export function consentFromCookieString(cookies: string): Consent | null {
  for (const part of cookies.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === CONSENT_COOKIE) return parseConsent(decodeURIComponent(v.join("=")));
  }
  return null;
}

export const allows = (consent: Consent | null, category: ConsentCategory): boolean =>
  Boolean(consent?.[category]);
