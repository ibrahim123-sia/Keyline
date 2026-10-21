import { connection } from "next/server";
import { normalizeQuery, suggest, SUGGEST_MIN } from "@/features/search/suggest";
import { hit } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/request";

/** Autocomplete (06 §4.3): `?q=` from the 2nd character; cached per normalized text. */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const q = normalizeQuery(new URL(request.url).searchParams.get("q") ?? "");
  if (q.length < SUGGEST_MIN)
    return Response.json({ q, items: [] }, { headers: { "cache-control": "no-store" } });
  const ip = clientIpFromHeaders(request.headers) ?? "unknown";
  const limit = await hit(`suggest:${ip}`, { limit: 120, windowSeconds: 60 });
  if (!limit.allowed)
    return Response.json(
      { q, items: [], error: "Too many searches. Please wait a moment." },
      { status: 429, headers: { "retry-after": "30", "cache-control": "no-store" } },
    );
  const items = await suggest(q);
  return Response.json(
    { q, items },
    { headers: { "cache-control": "public, max-age=60, s-maxage=300" } },
  );
}
