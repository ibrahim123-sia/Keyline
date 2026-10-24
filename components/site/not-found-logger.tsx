import { headers } from "next/headers";
import { after, connection } from "next/server";
import { getDb } from "@/db/client";
import { CRAWLER_AGENT } from "@/features/seo/crawl";
import { recordNotFound } from "@/features/seo/not-found-log";

/**
 * 404 monitor (08 §6): counts the address after the response is sent. The middleware passes
 * the address in x-keyline-path; render inside <Suspense> (it reads the request).
 */
export async function NotFoundLogger() {
  // Request time only: after() reads the clock, which prerendering must not do.
  await connection();
  const h = await headers();
  const path = h.get("x-keyline-path");
  // The weekly link check reports broken links itself.
  if (!path || h.get("user-agent") === CRAWLER_AGENT) return null;
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
