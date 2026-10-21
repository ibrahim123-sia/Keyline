import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { tags } from "@/lib/cache-tags";
import { buildSiteMenus } from "./queries";
import type { SiteMenus } from "./schema";

/**
 * Menus for the site header, phone menu and footer (cached: part of every page's static
 * shell). Saving a menu expires `menus`; renaming or unpublishing a linked page, project,
 * area guide or category expires that content's tag.
 */
export async function getSiteMenus(): Promise<SiteMenus> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.menus, tags.pages, tags.projects, tags.locations, tags.areaGuides, tags.posts);
  return buildSiteMenus(await getDb());
}
