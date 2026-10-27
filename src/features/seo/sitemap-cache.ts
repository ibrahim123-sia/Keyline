import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { loadSettings } from "@/features/settings/queries";
import { siteOrigin } from "@/features/site/url";
import { tags } from "@/lib/cache-tags";
import {
  SITEMAP_CHUNK,
  latestModified,
  sectionFiles,
  sitemapSections,
  sitemapUrls,
  type SitemapSection,
  type SitemapUrl,
} from "./sitemap";

/** What each section lists, so saving that content refreshes its file. */
const sectionTags: Record<SitemapSection, string[]> = {
  pages: [tags.pages, tags.listings, tags.projects, tags.developers, tags.agents],
  properties: [tags.listings],
  projects: [tags.projects],
  areas: [tags.listings, tags.locations, tags.areaGuides, tags.masterData("property-types")],
  posts: [tags.posts],
  agents: [tags.agents],
  developers: [tags.developers],
};

/** One section's addresses (cached; content saves expire the section's tags). */
export async function getSitemapUrls(section: SitemapSection): Promise<SitemapUrl[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.sitemap, tags.settings("seo"), ...sectionTags[section]);
  const db = await getDb();
  const seo = await loadSettings("seo", db);
  return sitemapUrls(db, section, seo, siteOrigin());
}

/** The files the sitemap index lists: non-empty sections, split past 50,000 addresses. */
export async function getSitemapFiles(): Promise<
  Array<{ file: string; lastModified: string | null }>
> {
  const files: Array<{ file: string; lastModified: string | null }> = [];
  for (const section of sitemapSections) {
    const urls = await getSitemapUrls(section);
    if (urls.length === 0) continue;
    sectionFiles(section, urls.length).forEach((file, i) => {
      const chunk = urls.slice(i * SITEMAP_CHUNK, (i + 1) * SITEMAP_CHUNK);
      files.push({ file, lastModified: latestModified(chunk.map((u) => u.lastModified)) });
    });
  }
  return files;
}
