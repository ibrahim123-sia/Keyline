import { z } from "zod";
import { getDb } from "@/db/client";
import { recordShortlistView } from "@/features/shortlists/store";

const body = z.object({ propertyId: z.uuid() });

/** A home opened from a shortlist page (counted once per home). Always 204. */
export async function POST(request: Request, ctx: RouteContext<"/api/shortlists/[token]/view">) {
  const { token } = await ctx.params;
  try {
    const parsed = body.safeParse(JSON.parse(await request.text()));
    if (parsed.success && /^[A-Za-z0-9_-]{20,40}$/.test(token))
      await recordShortlistView(await getDb(), token, parsed.data.propertyId);
  } catch {
    // Bad input: nothing to count.
  }
  return new Response(null, { status: 204 });
}
