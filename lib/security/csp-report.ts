/**
 * Parses Content-Security-Policy violation reports: the legacy `report-uri` body
 * (`{"csp-report": {...}}`) and Reporting API batches (`[{type: "csp-violation", body}]`).
 * Keeps the directive and origins only, never query strings (they can carry personal data).
 */
export const MAX_CSP_REPORT_BODY = 64 * 1024;
const MAX_REPORTS = 20;

export type CspViolation = {
  page: string | null;
  directive: string | null;
  blocked: string | null;
  disposition: string | null;
  source: string | null;
};

/** Origin and path only; inline/eval/data keep their keyword. */
function shorten(value: unknown, keepPath: boolean): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const u = new URL(value);
    return keepPath ? `${u.origin}${u.pathname}` : u.origin;
  } catch {
    return value.slice(0, 40);
  }
}

function fromBody(body: Record<string, unknown>): CspViolation {
  const pick = (...keys: string[]) => keys.map((k) => body[k]).find((v) => v != null);
  return {
    page: shorten(pick("documentURL", "document-uri"), true),
    directive:
      String(pick("effectiveDirective", "effective-directive", "violated-directive") ?? "")
        .slice(0, 60)
        .trim() || null,
    blocked: shorten(pick("blockedURL", "blocked-uri"), false),
    disposition: (pick("disposition") as string | undefined)?.slice(0, 20) ?? null,
    source: shorten(pick("sourceFile", "source-file"), true),
  };
}

export function parseReports(raw: unknown): CspViolation[] {
  const items = Array.isArray(raw) ? raw : [raw];
  const out: CspViolation[] = [];
  for (const item of items.slice(0, MAX_REPORTS)) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const body = (r["csp-report"] ?? (r.type === "csp-violation" ? r.body : null)) as
      Record<string, unknown> | null | undefined;
    if (body && typeof body === "object") out.push(fromBody(body));
  }
  return out;
}
