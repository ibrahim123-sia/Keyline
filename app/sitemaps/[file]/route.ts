import { SITEMAP_CHUNK, parseSitemapFile, urlsetXml } from "@/features/seo/sitemap";
import { getSitemapUrls } from "@/features/seo/sitemap-cache";
import { siteOrigin } from "@/features/site/url";

/** One sitemap file from the index: /sitemaps/properties.xml, /sitemaps/properties-2.xml… */
export async function GET(_request: Request, ctx: RouteContext<"/sitemaps/[file]">) {
  const { file } = await ctx.params;
  const parsed = parseSitemapFile(file);
  if (!parsed) return new Response("Not found", { status: 404 });
  const urls = await getSitemapUrls(parsed.section);
  const chunk = urls.slice((parsed.chunk - 1) * SITEMAP_CHUNK, parsed.chunk * SITEMAP_CHUNK);
  if (parsed.chunk > 1 && chunk.length === 0) return new Response("Not found", { status: 404 });
  return new Response(urlsetXml(chunk, siteOrigin()), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
