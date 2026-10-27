import { getDb } from "@/db/client";
import { isBot } from "@/features/attribution/bots";
import { recordShortlistOpen } from "@/features/shortlists/store";

/**
 * The lead opened their shortlist (sent by the page once it has loaded in a browser, so link
 * scanners and chat previews are not counted). Always 204.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/shortlists/[token]/open">) {
  const { token } = await ctx.params;
  if (/^[A-Za-z0-9_-]{20,40}$/.test(token) && !isBot(request.headers.get("user-agent") ?? ""))
    await recordShortlistOpen(await getDb(), token).catch(() => false);
  return new Response(null, { status: 204 });
}
