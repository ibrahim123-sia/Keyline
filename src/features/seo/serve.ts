import "server-only";
import { permanentRedirect, redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { lookupRedirect } from "./redirects-admin";

/**
 * Where an address that shows nothing now lives (08 §6 redirects manager), counting the hit.
 * Memoised per request, so generateMetadata and the page can both ask without counting twice.
 */
export const servedRedirect = cache(
  async (path: string): Promise<{ to: string; permanent: boolean } | null> => {
    const found = await lookupRedirect(await getDb(), path);
    return found ? { to: found.to, permanent: found.row.type !== 302 } : null;
  },
);

/**
 * Sends the visitor on when a redirect covers `path` (308 for permanent rules, 307 for
 * temporary ones). `parent` also tries a redirected parent address and keeps the rest, e.g.
 * /buy/old-area/villas follows /buy/old-area -> /buy/new-area.
 */
export async function redirectIfMoved(
  path: string,
  parent?: { path: string; rest: string },
): Promise<void> {
  const moved =
    (await servedRedirect(path)) ??
    (parent
      ? await servedRedirect(parent.path).then((m) => m && { ...m, to: m.to + parent.rest })
      : null);
  if (moved) (moved.permanent ? permanentRedirect : redirect)(moved.to);
}
