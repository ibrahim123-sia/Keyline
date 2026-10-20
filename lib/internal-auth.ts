import { timingSafeEqual } from "@/lib/crypto";

/**
 * Internal endpoints (/api/internal/*) are called by the queue consumer and cron forwarders
 * in the custom worker, and by the dev cron runner. They require the shared secret.
 */
export function isInternalRequest(request: Request): boolean {
  const secret = process.env.INTERNAL_JOB_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token.length > 0 && timingSafeEqual(token, secret);
}

export function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
