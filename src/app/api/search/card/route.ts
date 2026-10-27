import { connection } from "next/server";
import { publicCard } from "@/features/search/page-data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The card for the map's selected pin on phones (06 §4.1); live, searchable listings only. */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return Response.json({ card: null }, { status: 400 });
  const card = await publicCard(id);
  return Response.json(
    { card },
    {
      status: card ? 200 : 404,
      headers: { "cache-control": "public, max-age=30, s-maxage=60" },
    },
  );
}
