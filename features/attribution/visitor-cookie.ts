/**
 * The first-party visitor id (09 §2): a random id the middleware sets on the first request
 * and keeps for a year. When the visitor refuses analytics cookies it becomes a cookie for
 * this browser session only ("s." prefix), with the same id, so the visit can still be
 * attributed. Edge-safe (the middleware uses it).
 */
export const VISITOR_COOKIE = "vid";
export const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VisitorCookie = { key: string; sessionOnly: boolean };

export function parseVisitorCookie(value: string | null | undefined): VisitorCookie | null {
  if (!value) return null;
  const sessionOnly = value.startsWith("s.");
  const key = sessionOnly ? value.slice(2) : value;
  return UUID.test(key) ? { key: key.toLowerCase(), sessionOnly } : null;
}

export function visitorCookieValue(cookie: VisitorCookie): string {
  return cookie.sessionOnly ? `s.${cookie.key}` : cookie.key;
}

/**
 * The cookie to set on this response, or null when the current one is right. New visitors
 * get an id; a change of consent switches between a year and this session, keeping the id.
 */
export function visitorCookieUpdate(
  current: string | null | undefined,
  analyticsRefused: boolean,
  newKey: () => string,
): VisitorCookie | null {
  const parsed = parseVisitorCookie(current);
  if (!parsed) return { key: newKey(), sessionOnly: analyticsRefused };
  if (parsed.sessionOnly !== analyticsRefused)
    return { key: parsed.key, sessionOnly: analyticsRefused };
  return null;
}
