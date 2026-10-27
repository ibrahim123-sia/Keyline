import { type NextRequest } from "next/server";
import { countPostView } from "@/features/blog/public";
import { hit } from "@/lib/rate-limit";
import { clientIpFromHeaders, truncateIp } from "@/lib/request";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One view per visitor address and post every 30 minutes counts. */
const viewRule = { limit: 1, windowSeconds: 1800 };

/** POST /api/insights/view {"id": "<post id>"}: the post page's view beacon (08 §3 views). */
export async function POST(request: NextRequest) {
  let id: unknown;
  try {
    ({ id } = JSON.parse(await request.text()) as { id?: unknown });
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof id !== "string" || !UUID.test(id)) return new Response(null, { status: 400 });
  const ip = truncateIp(clientIpFromHeaders(request.headers)) ?? "unknown";
  const limit = await hit(`post-view:${ip}:${id}`, viewRule);
  if (limit.allowed) await countPostView(id);
  return new Response(null, { status: 204 });
}
