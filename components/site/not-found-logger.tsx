import { headers } from "next/headers";
import { after } from "next/server";
import { getDb } from "@/db/client";
import { recordNotFound } from "@/features/seo/not-found-log";

/**
 * 404 monitor (08 §6): counts the address after the response is sent. The middleware passes
 * the address in x-lintel-path; render inside <Suspense> (it reads the request).
 */
export async function NotFoundLogger() {
  const h = await headers();
  const path = h.get("x-lintel-path");
  if (!path) return null;
  const referrer = h.get("referer");
  after(async () => {
    try {
      await recordNotFound(await getDb(), path, referrer);
    } catch (err) {
      console.error("[404 monitor]", err);
    }
  });
  return null;
}
