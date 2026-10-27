import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { pages } from "@/db/schema/cms";
import { loadSettings } from "@/features/settings/queries";
import { tags } from "@/lib/cache-tags";
import { announcementWindow, secondsUntil } from "./announcement";

export type LiveAnnouncement = { text: string; link: { label: string; href: string } | null };

/**
 * The announcement bar when it shows now (cached with the site shell). Its lifetime ends at
 * the next start or end time, so a scheduled bar appears and disappears on its own.
 */
export async function getAnnouncement(): Promise<LiveAnnouncement | null> {
  "use cache";
  cacheTag(tags.settings("website"));
  const { announcement: a } = await loadSettings("website");
  const now = Date.now();
  const { state, nextChange } = announcementWindow(a, now);
  if (nextChange) cacheLife({ revalidate: secondsUntil(nextChange, now) });
  else cacheLife("max");
  if (state !== "live") return null;
  return {
    text: a.text,
    link: a.linkLabel && a.href ? { label: a.linkLabel, href: a.href } : null,
  };
}

/** Privacy, terms and cookie policy links for the footer (Settings -> Legal), when published. */
export async function getLegalLinks(): Promise<Array<{ label: string; href: string }>> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.settings("legal"), tags.pages);
  const db = await getDb();
  const legal = await loadSettings("legal", db);
  const ids = [legal.privacyPageId, legal.termsPageId, legal.cookiePageId].filter(
    (id): id is string => Boolean(id),
  );
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: pages.id, title: pages.title, slug: pages.slug })
    .from(pages)
    .where(
      and(
        eq(pages.agencyId, currentAgencyId()),
        inArray(pages.id, ids),
        eq(pages.status, "published"),
        isNull(pages.deletedAt),
      ),
    );
  return ids
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is (typeof rows)[number] => Boolean(r))
    .map((r) => ({ label: r.title, href: `/${r.slug}` }));
}
