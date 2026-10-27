import { and, eq, sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { utmLinks } from "@/db/schema/crm";
import { isBot } from "@/features/attribution/bots";
import { campaignUrl, SHORT_CODE } from "@/features/utm/links";

/**
 * Short campaign links (09 §2): /go/abc12 counts the click and sends the visitor to the page
 * with its UTM tags, where the landing records the touch. Link previews and bots are not
 * counted. An unknown or deleted code goes to the home page (printed QR codes live long).
 */
export async function GET(request: Request, ctx: RouteContext<"/go/[code]">) {
  await connection();
  const { code } = await ctx.params;
  const origin = new URL(request.url).origin;
  const home = Response.redirect(new URL("/", origin), 302);
  if (!SHORT_CODE.test(code)) return home;

  const db = await getDb();
  const where = and(eq(utmLinks.agencyId, currentAgencyId()), eq(utmLinks.shortCode, code));
  const counted = !isBot(request.headers.get("user-agent"));
  const [link] = counted
    ? await db
        .update(utmLinks)
        .set({ clicks: sql`${utmLinks.clicks} + 1`, lastClickedAt: new Date() })
        .where(where)
        .returning()
    : await db.select().from(utmLinks).where(where);
  if (!link) return home;

  return new Response(null, {
    status: 302,
    headers: {
      location: campaignUrl(origin, link.baseUrl, link),
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
