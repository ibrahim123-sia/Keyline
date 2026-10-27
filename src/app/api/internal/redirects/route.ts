import { and, eq, sql } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { seoRedirects } from "@/db/schema/seo";
import { isInternalRequest, unauthorized } from "@/lib/internal-auth";

/**
 * The redirects table for the middleware (08 §6): it serves redirects before a page renders,
 * so old addresses answer with a real 301/302 (a page that has started streaming cannot change
 * its status). The middleware keeps a copy for a few seconds and reports hits here.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  if (!isInternalRequest(request)) return unauthorized();
  const db = await getDb();
  const rows = await db
    .select({
      id: seoRedirects.id,
      from: seoRedirects.fromPath,
      to: seoRedirects.toPath,
      status: seoRedirects.type,
    })
    .from(seoRedirects)
    .where(eq(seoRedirects.agencyId, currentAgencyId()));
  return Response.json(
    { rules: rows.map((r) => [r.from, r.id, r.to, r.status]) },
    { headers: { "cache-control": "no-store" } },
  );
}

const hitSchema = z.object({ id: z.uuid() });

/** One served redirect: its hit counter and last use, for the redirects manager. */
export async function POST(request: Request): Promise<Response> {
  if (!isInternalRequest(request)) return unauthorized();
  const parsed = hitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const db = await getDb();
  await db
    .update(seoRedirects)
    .set({ hits: sql`${seoRedirects.hits} + 1`, lastHitAt: new Date() })
    .where(and(eq(seoRedirects.id, parsed.data.id), eq(seoRedirects.agencyId, currentAgencyId())));
  return new Response(null, { status: 204 });
}
