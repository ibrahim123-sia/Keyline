import { connection } from "next/server";
import { parseSearch } from "@/features/search/params";
import { searchPins } from "@/features/search/query";

/**
 * Map pins for a search (06 §4.5). The query is the full search (purpose included); pins of
 * listings without a public exact location are already moved by searchPins.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const filters = parseSearch(new URL(request.url).searchParams);
  const pins = await searchPins({ ...filters, page: 1 });
  return Response.json(
    { pins },
    { headers: { "cache-control": "public, max-age=30, s-maxage=60" } },
  );
}
