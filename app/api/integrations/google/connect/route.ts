import { connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { connectUrl } from "@/features/integrations/google-calendar/calendar";
import { requireAdmin } from "@/lib/auth/guards";

/** "Connect Google Calendar" on an agent profile: off to Google's consent screen (13 §1). */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const url = new URL(request.url);
  const back = (query: string) =>
    Response.redirect(new URL(`/admin/setup/agents?${query}`, url.origin), 303);
  try {
    await requireAdmin({ write: true });
  } catch {
    return Response.redirect(new URL("/admin/sign-in", url.origin), 303);
  }
  const agent = z.uuid().safeParse(url.searchParams.get("agent"));
  if (!agent.success) return back("calendar=error&reason=agent");
  try {
    return Response.redirect(await connectUrl(await getDb(), agent.data), 303);
  } catch (err) {
    return back(`calendar=error&reason=${encodeURIComponent((err as Error).message)}`);
  }
}
