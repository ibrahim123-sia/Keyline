import { connection } from "next/server";
import { parseSearch } from "@/features/search/params";
import { countListings } from "@/features/search/page-data";

/** "Show N homes" in the filter sheet (06 §4.1): how many match before applying. */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const filters = parseSearch(new URL(request.url).searchParams);
  const count = await countListings({ ...filters, page: 1 });
  return Response.json(
    { count },
    { headers: { "cache-control": "public, max-age=30, s-maxage=60" } },
  );
}
