import { connection } from "next/server";
import { getDb } from "@/db/client";
import { completeConnect } from "@/features/integrations/google-calendar/calendar";
import { requireAdmin } from "@/lib/auth/guards";

/**
 * Google sends the admin back here after consent (13 §1): the code becomes the agent's
 * stored (encrypted) tokens, then back to Setup -> Agents with the outcome.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const url = new URL(request.url);
  const back = (query: string) =>
    Response.redirect(new URL(`/admin/setup/agents?${query}`, url.origin), 303);
  let actor;
  try {
    actor = (await requireAdmin({ write: true })).actor;
  } catch {
    return Response.redirect(new URL("/admin/sign-in", url.origin), 303);
  }
  const denied = url.searchParams.get("error");
  if (denied) return back(`calendar=error&reason=${encodeURIComponent(denied)}`);
  const code = url.searchParams.get("code");
  if (!code) return back("calendar=error&reason=no-code");
  try {
    const { email } = await completeConnect(await getDb(), {
      code,
      state: url.searchParams.get("state"),
      actor,
    });
    return back(`calendar=connected${email ? `&account=${encodeURIComponent(email)}` : ""}`);
  } catch (err) {
    return back(`calendar=error&reason=${encodeURIComponent((err as Error).message)}`);
  }
}
