import { log, requestIdFrom } from "@/lib/log";
import { MAX_CSP_REPORT_BODY, parseReports } from "@/lib/security/csp-report";

/**
 * Content-Security-Policy violation reports (14 §2), for rolling the policy out in report-only
 * mode first (CSP_REPORT_ONLY=true): each one becomes a structured log line. Nothing is stored.
 */
export async function POST(request: Request): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_CSP_REPORT_BODY) return new Response(null, { status: 413 });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const requestId = requestIdFrom(request.headers);
  for (const v of parseReports(raw)) log("warn", "csp.violation", { ...v, requestId });
  return new Response(null, { status: 204 });
}
