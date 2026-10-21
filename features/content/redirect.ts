import "server-only";
import { eq, sql } from "drizzle-orm";
import { permanentRedirect, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { seoRedirects } from "@/db/schema/seo";
import { findRedirect } from "@/features/seo/redirects";

/**
 * For a slug the site does not know: when the address moved (a slug change adds a 301,
 * 08 §6), go there and count the hit for the redirects manager. Not cached: it only runs
 * for unknown slugs. Returns when there is no redirect, so the caller shows the 404.
 */
export async function followRedirect(path: string): Promise<void> {
  const db = await getDb();
  const row = await findRedirect(db, path);
  if (!row) return;
  await db
    .update(seoRedirects)
    .set({ hits: sql`${seoRedirects.hits} + 1`, lastHitAt: new Date() })
    .where(eq(seoRedirects.id, row.id));
  (row.type === 302 ? redirect : permanentRedirect)(row.toPath);
}
