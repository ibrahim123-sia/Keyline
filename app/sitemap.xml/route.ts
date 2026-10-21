import { sitemapIndexXml } from "@/features/seo/sitemap";
import { getSitemapFiles } from "@/features/seo/sitemap-cache";
import { siteOrigin } from "@/features/site/url";

/** Sitemap index (08 §6): one file per kind of page, each with its last change. */
export async function GET(): Promise<Response> {
  const xml = sitemapIndexXml(await getSitemapFiles(), siteOrigin());
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
}
