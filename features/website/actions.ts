"use server";

import { updateTag } from "next/cache";
import { getDb } from "@/db/client";
import { patchSettings } from "@/features/settings/mutations";
import { announcementSchema, footerSchema } from "@/features/settings/schema";
import { adminAction } from "@/lib/actions";
import { tags } from "@/lib/cache-tags";

/** Website -> Menus -> Footer: the footer text and legal line (only that part of the group). */
export const saveFooterSettings = adminAction(
  footerSchema,
  { write: true },
  async (footer, ctx) => {
    const db = await getDb();
    const saved = await db.transaction((tx) => patchSettings(tx, "website", { footer }, ctx.actor));
    updateTag(tags.settings("website"));
    return saved.footer;
  },
);

/** Website -> Menus -> Announcement bar. */
export const saveAnnouncement = adminAction(
  announcementSchema,
  { write: true },
  async (announcement, ctx) => {
    const db = await getDb();
    const saved = await db.transaction((tx) =>
      patchSettings(tx, "website", { announcement }, ctx.actor),
    );
    updateTag(tags.settings("website"));
    return saved.announcement;
  },
);
