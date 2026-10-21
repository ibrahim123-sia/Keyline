import { describe, expect, it } from "vitest";
import { CRAWLER_AGENT, crawlSite, internalLinks, type CrawlFetch } from "@/features/seo/crawl";

const origin = "https://agency.example";

const html = (body: string) =>
  new Response(`<!doctype html><html><body>${body}</body></html>`, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
const xml = (body: string) =>
  new Response(body, { status: 200, headers: { "content-type": "application/xml" } });

describe("site crawl", () => {
  it("collects internal page links only", () => {
    const links = internalLinks(
      `<a href="/buy">Buy</a><a class="x" href='/property/a?tab=1#map'>A</a>
       <a href="https://agency.example/rent">Rent</a><a href="https://other.example/">Out</a>
       <a href="mailto:hi@agency.example">Mail</a><a href="#top">Top</a>
       <a href="/admin/properties">Admin</a><a href="/media/a.jpg">File</a><a href="/a&amp;b">Amp</a>`,
      `${origin}/`,
      origin,
    );
    expect(links).toEqual([
      `${origin}/buy`,
      `${origin}/property/a?tab=1`,
      `${origin}/rent`,
      `${origin}/a&b`,
    ]);
  });

  it("finds broken and redirected links from the sitemap's pages", async () => {
    const seen: Array<{ url: string; method: string; agent: string | null }> = [];
    const fetch: CrawlFetch = async (url, init) => {
      seen.push({
        url,
        method: init?.method ?? "GET",
        agent: new Headers(init?.headers).get("user-agent"),
      });
      const path = url.slice(origin.length);
      switch (path) {
        case "/sitemap.xml":
          return xml(
            `<sitemapindex><sitemap><loc>${origin}/sitemaps/pages.xml</loc></sitemap></sitemapindex>`,
          );
        case "/sitemaps/pages.xml":
          return xml(
            `<urlset><url><loc>${origin}/</loc></url><url><loc>${origin}/about</loc></url></urlset>`,
          );
        case "/":
          return html(`<a href="/about">About</a><a href="/gone">Gone</a><a href="/old">Old</a>`);
        case "/about":
          return html(`<a href="/gone">Gone again</a><a href="/">Home</a>`);
        case "/old":
          return new Response(null, { status: 308, headers: { location: "/new" } });
        default:
          return new Response("Not found", { status: 404 });
      }
    };
    const result = await crawlSite({ origin, fetch, now: new Date("2026-10-21T04:30:00.000Z") });
    expect(result).toMatchObject({
      checkedAt: "2026-10-21T04:30:00.000Z",
      pages: 2,
      links: 4,
      truncated: false,
      broken: [{ href: "/gone", status: 404, foundOn: ["/", "/about"] }],
      redirected: [{ href: "/old", status: 308, to: "/new", foundOn: ["/"] }],
    });
    // Pages from the sitemap are not checked twice; extra links get a HEAD request.
    expect(seen.filter((s) => s.url === `${origin}/about`)).toHaveLength(1);
    expect(seen.find((s) => s.url === `${origin}/gone`)?.method).toBe("HEAD");
    expect(seen.every((s) => s.agent === CRAWLER_AGENT)).toBe(true);
  });

  it("stops at its limits and survives network errors", async () => {
    const fetch: CrawlFetch = async (url) => {
      if (url.endsWith("/sitemap.xml"))
        return xml(`<sitemapindex><sitemap><loc>${origin}/s.xml</loc></sitemap></sitemapindex>`);
      if (url.endsWith("/s.xml"))
        return xml(
          `<urlset>${["/a", "/b", "/c"].map((p) => `<url><loc>${origin}${p}</loc></url>`).join("")}</urlset>`,
        );
      if (url.endsWith("/a")) return html(`<a href="/down">Down</a>`);
      throw new Error("offline");
    };
    const result = await crawlSite({ origin, fetch, maxPages: 1 });
    expect(result.truncated).toBe(true);
    expect(result.pages).toBe(1);
    expect(result.broken).toEqual([{ href: "/down", status: 0, foundOn: ["/a"] }]);
  });
});
