import { connection } from "next/server";
import { getDb } from "@/db/client";
import { compareIds, savedIds } from "@/features/account/store";
import { currentVisitorKey } from "@/features/attribution/current";
import { getCurrentUser } from "@/lib/auth/guards";

/**
 * What this browser has saved (12): the hearts and the compare tray read it once per page,
 * after the page has loaded, so listing pages stay cacheable for everyone.
 */
export async function GET(): Promise<Response> {
  await connection();
  const user = await getCurrentUser();
  const db = await getDb();
  const headers = { "cache-control": "private, no-store" };
  if (user && user.role === "customer") {
    const saved = await savedIds(db, user.id);
    return Response.json(
      { signedIn: true, saved, compare: await compareIds(db, { userId: user.id }) },
      { headers },
    );
  }
  const visitorKey = await currentVisitorKey();
  return Response.json(
    {
      signedIn: Boolean(user),
      saved: { properties: [], projects: [] },
      compare: visitorKey ? await compareIds(db, { visitorKey }) : [],
    },
    { headers },
  );
}
