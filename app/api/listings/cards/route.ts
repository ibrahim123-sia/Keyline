import { NextResponse, type NextRequest } from "next/server";
import { publicCards } from "@/features/listings/public-cards";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/listings/cards?ids=a,b,c: public card data for up to 12 live listings. */
export async function GET(request: NextRequest) {
  const ids = [
    ...new Set(
      (request.nextUrl.searchParams.get("ids") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => UUID.test(s)),
    ),
  ].slice(0, 12);
  const cards = await publicCards(ids);
  return NextResponse.json(
    { cards },
    { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
