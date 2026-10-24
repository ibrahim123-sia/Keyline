/**
 * Structured logs (14 §5): one JSON line per event, with the request id when there is one,
 * read by Cloudflare's Workers logs (or the terminal locally). No personal data: fields whose
 * names look personal or secret are replaced before the line is written, and errors keep only
 * their name, message and stack.
 */
export type LogLevel = "info" | "warn" | "error";

export const REQUEST_ID_HEADER = "x-request-id";

const SENSITIVE =
  /email|phone|password|token|secret|authorization|cookie|^ip$|^address$|^(first|last|full|contact)name$/i;

function clean(value: unknown, depth = 0): unknown {
  if (value instanceof Error)
    return {
      name: value.name,
      message: value.message.slice(0, 1000),
      ...(value.stack ? { stack: value.stack.slice(0, 2000) } : {}),
    };
  if (typeof value === "string") return value.slice(0, 1000);
  if (value === null || typeof value !== "object") return value;
  if (depth >= 3) return "[object]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => clean(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 40))
    out[k] = SENSITIVE.test(k) ? "[redacted]" : clean(v, depth + 1);
  return out;
}

/** The JSON line for one event (exported for tests). */
export function logLine(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
  now: Date = new Date(),
): string {
  // Release tag (14 §5 "error tracking with release tags"), set per deploy.
  const release = process.env.KEYLINE_RELEASE || undefined;
  return JSON.stringify({
    level,
    event,
    at: now.toISOString(),
    ...(release ? { release } : {}),
    ...(clean(fields) as Record<string, unknown>),
  });
}

export function log(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
  const line = logLine(level, event, fields);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** The request id the middleware gave this request (Cloudflare's ray id when there is one). */
export function requestIdFrom(h: Headers): string | null {
  return h.get(REQUEST_ID_HEADER) ?? h.get("cf-ray");
}

/** Request id for code that runs inside a request (route handlers, actions); null in jobs. */
export async function currentRequestId(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    return requestIdFrom(await headers());
  } catch {
    return null;
  }
}
