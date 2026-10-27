import { connection } from "next/server";
import { getDb } from "@/db/client";
import { unsubscribe } from "@/features/alerts/unsubscribe";

const params = (request: Request) => {
  const url = new URL(request.url);
  return { token: url.searchParams.get("token"), pref: url.searchParams.get("pref") };
};

/** The unsubscribe link in alert emails: one click, then a confirmation page (12 §3). */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const result = await unsubscribe(await getDb(), params(request));
  const to = new URL("/alerts/unsubscribed", request.url);
  if (result.kind === "search") to.searchParams.set("search", result.name);
  else to.searchParams.set("kind", result.kind);
  return new Response(null, {
    status: 303,
    headers: { location: to.toString(), "cache-control": "no-store" },
  });
}

/** One-click unsubscribe from the mail app's own button (List-Unsubscribe-Post, RFC 8058). */
export async function POST(request: Request): Promise<Response> {
  await connection();
  const result = await unsubscribe(await getDb(), params(request));
  return new Response(result.kind === "invalid" ? "Link not valid" : "Unsubscribed", {
    status: result.kind === "invalid" ? 404 : 200,
    headers: { "cache-control": "no-store" },
  });
}
