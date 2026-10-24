/**
 * Weekly crawl for the SEO report (08 §6 "broken internal links"): reads the sitemap, opens
 * every page in it, collects the links to this site and checks each one once. The fetcher is
 * passed in (the site itself on Workers, plain fetch elsewhere, a fake in tests).
 */

export const CRAWLER_AGENT = "KeylineSiteCheck/1.0";

export type CrawlFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type CrawlLink = { href: string; status: number; to?: string; foundOn: string[] };

export type CrawlResult = {
  checkedAt: string;
  pages: number;
  links: number;
  broken: CrawlLink[];
  redirected: CrawlLink[];
  /** True when the limits stopped the crawl early. */
  truncated: boolean;
};

const LOC = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
const HREF = /<a\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi;
const SKIP = /^\/(admin|api|account|_next|media)(\/|$)/;

const unescapeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** Links in a page's HTML that point at a page of this site (no files, no admin). */
export function internalLinks(html: string, pageUrl: string, origin: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(HREF)) {
    const raw = unescapeXml((m[2] ?? m[3] ?? "").trim());
    if (!raw || raw.startsWith("#") || /^(mailto|tel|javascript|data):/i.test(raw)) continue;
    let url: URL;
    try {
      url = new URL(raw, pageUrl);
    } catch {
      continue;
    }
    if (url.origin !== origin || SKIP.test(url.pathname)) continue;
    url.hash = "";
    out.add(url.toString());
  }
  return [...out];
}

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await work(items[next++]!);
    }),
  );
}

export async function crawlSite({
  origin,
  fetch,
  maxPages = 500,
  maxLinks = 2000,
  concurrency = 4,
  now = new Date(),
}: {
  origin: string;
  fetch: CrawlFetch;
  maxPages?: number;
  maxLinks?: number;
  concurrency?: number;
  now?: Date;
}): Promise<CrawlResult> {
  const headers = { "user-agent": CRAWLER_AGENT };
  const get = async (url: string, method = "GET") => {
    try {
      return await fetch(url, {
        method,
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return null;
    }
  };
  const locs = async (url: string) => {
    const res = await get(url);
    if (!res || !res.ok) return [];
    return [...(await res.text()).matchAll(LOC)].map((m) => unescapeXml(m[1]!));
  };

  // The sitemap index lists the section files; they list the pages.
  const pages: string[] = [];
  for (const file of await locs(`${origin}/sitemap.xml`)) {
    for (const page of await locs(file)) if (page.startsWith(origin)) pages.push(page);
  }
  let truncated = pages.length > maxPages;
  const toVisit = pages.slice(0, maxPages);

  const status = new Map<string, { status: number; to?: string }>();
  const foundOn = new Map<string, string[]>();
  await pool(toVisit, concurrency, async (page) => {
    const res = await get(page);
    status.set(page, { status: res?.status ?? 0, to: res?.headers.get("location") ?? undefined });
    if (!res || !res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return;
    const path = new URL(page).pathname;
    for (const link of internalLinks(await res.text(), page, origin)) {
      const list = foundOn.get(link) ?? [];
      if (list.length < 5 && !list.includes(path)) list.push(path);
      foundOn.set(link, list);
    }
  });

  const unchecked = [...foundOn.keys()].filter((l) => !status.has(l));
  if (unchecked.length > maxLinks) truncated = true;
  await pool(unchecked.slice(0, maxLinks), concurrency, async (link) => {
    let res = await get(link, "HEAD");
    if (res && (res.status === 405 || res.status === 501)) res = await get(link);
    status.set(link, { status: res?.status ?? 0, to: res?.headers.get("location") ?? undefined });
  });

  const broken: CrawlLink[] = [];
  const redirected: CrawlLink[] = [];
  for (const [href, where] of foundOn) {
    const s = status.get(href);
    if (!s) continue;
    const item = { href: href.slice(origin.length) || "/", status: s.status, foundOn: where };
    if (s.status === 0 || s.status >= 400) broken.push(item);
    else if (s.status >= 300) redirected.push({ ...item, to: s.to });
  }
  const byHits = (a: CrawlLink, b: CrawlLink) => b.foundOn.length - a.foundOn.length;
  return {
    checkedAt: now.toISOString(),
    pages: toVisit.length,
    links: foundOn.size,
    broken: broken.sort(byHits).slice(0, 500),
    redirected: redirected.sort(byHits).slice(0, 500),
    truncated,
  };
}
