import { revalidateTag } from "next/cache";
import { z } from "zod";
import { isInternalRequest, unauthorized } from "@/lib/internal-auth";

const bodySchema = z.object({ tags: z.array(z.string().min(1).max(256)).min(1).max(50) }).strict();

/**
 * Expires cache tags immediately. Used by jobs that change public data outside a Server Action
 * and by operators after a manual database change.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isInternalRequest(request)) return unauthorized();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
  for (const tag of parsed.data.tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: parsed.data.tags });
}
