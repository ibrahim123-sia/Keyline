import { connection } from "next/server";
import { getDb } from "@/db/client";
import { exportCustomerData } from "@/features/account/privacy";
import { getCurrentUser } from "@/lib/auth/guards";

/** "Download my data" (12 §2 Privacy): the signed-in customer's data as a JSON file. */
export async function GET(): Promise<Response> {
  await connection();
  const user = await getCurrentUser();
  if (!user || user.role !== "customer") return new Response("Sign in first", { status: 401 });
  const data = await exportCustomerData(await getDb(), user.id);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="my-data.json"',
      "cache-control": "private, no-store",
    },
  });
}
