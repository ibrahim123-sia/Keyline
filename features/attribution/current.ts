import "server-only";
import { parseVisitorCookie, VISITOR_COOKIE } from "./visitor-cookie";

/** The current request's visitor id; null outside a request (jobs, tests) or without the cookie. */
export async function currentVisitorKey(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return parseVisitorCookie((await cookies()).get(VISITOR_COOKIE)?.value)?.key ?? null;
  } catch {
    return null;
  }
}
