import { chromium, expect, test, type Page } from "@playwright/test";
import {
  clearListings,
  db,
  expectNotFoundPage,
  publicTags,
  revalidateTags,
  seedDemo,
} from "./helpers";

/**
 * Phase 4 checklist (15): every public route renders server-side with the real demo seed, and
 * the property page meets the Core Web Vitals targets (14 §1) in a Lighthouse mobile run.
 */
test.describe.configure({ mode: "serial" });

let listingSlug = "";

test.beforeAll(async ({ request }) => {
  test.setTimeout(240_000);
  await seedDemo(request);
  const { rows } = await db().query(
    `select p.slug from properties p
       where p.status = 'available' and p.completion = 'ready' and p.purpose = 'sale'
         and exists (select 1 from property_media m where m.property_id = p.id and m.kind = 'photo')
       order by p.is_featured desc, p.published_at desc limit 1`,
  );
  listingSlug = rows[0].slug;
});

test.afterAll(async ({ request }) => {
  // Later specs expect a fresh agency: drop the demo content and settings again.
  await clearListings();
  await db().query("delete from pages");
  await db().query("delete from settings");
  await revalidateTags(request, publicTags);
});

async function expectPage(page: Page, path: string, h1: string | RegExp) {
  const res = await page.goto(path);
  expect(res?.status(), path).toBe(200);
  await expect(page.getByRole("heading", { level: 1 }).first(), path).toHaveText(h1);
}

test("every public route renders with the demo data", async ({ page }) => {
  test.setTimeout(300_000);
  await expectPage(page, "/", "Find a home you will love coming back to");
  await expect(page.getByRole("region", { name: "Homes we would move into" })).toBeVisible();
  await expect(page.getByRole("region", { name: "New projects with payment plans" })).toBeVisible();
  await expectPage(page, "/buy", /for sale/i);
  await expectPage(page, "/rent", /for rent/i);
  await expectPage(page, "/off-plan", /off-plan/i);
  await expectPage(page, "/buy/dubai-marina", /Dubai Marina/);
  await expectPage(page, "/buy/dubai-marina/apartments", /Apartments.*Dubai Marina/);
  const { rows } = await db().query("select title from properties where slug = $1", [listingSlug]);
  await expectPage(page, `/property/${listingSlug}`, rows[0].title);
  await expectPage(page, "/projects", /projects/i);
  await expectPage(page, "/projects/the-linden-residences", "The Linden Residences");
  await expectPage(page, "/developers", /developers/i);
  await expectPage(page, "/developers/northline-developments", "Northline Developments");
  await expectPage(page, "/agents", /team|agents/i);
  await expectPage(page, "/agents/layla-haddad", "Layla Haddad");
  // Page builder pages from the seed (08 §1), in their templates.
  await expectPage(page, "/about", "A small team that visits every home");
  await expectPage(page, "/contact", "Talk to us");
  await expectPage(page, "/sell-with-us", "Sell or let your home with people who know it");
  await expectPage(page, "/off-plan-guide", "Buying off-plan in Dubai, step by step");
  await expectPage(page, "/how-we-verify", "How we verify listings");
  await expectPage(page, "/privacy-policy", "Privacy policy");
  await expect(page.getByRole("navigation", { name: "On this page" })).toBeVisible();
  await expectPage(page, "/terms", "Terms of use");
  await expectPage(page, "/cookie-policy", "Cookie policy");
  // Any single-segment address is a page-builder address: a missing one is a soft 404.
  await expectNotFoundPage(page, "/no-such-page-here");
  const missing = await page.goto("/no/such-page-here");
  expect(missing?.status()).toBe(404);
});

/** The part of a Lighthouse result the summary reads. */
type Lhr = { audits: Record<string, { numericValue?: number; details?: unknown } | undefined> };
type Row = Record<string, unknown>;

/** The numbers behind a slow run: metrics, the LCP element and its parts, heavy requests and scripts. */
function lighthouseSummary(lhr: Lhr): string {
  const audit = (id: string) => lhr.audits[id];
  const items = (id: string): Row[] => {
    const d = audit(id)?.details as { items?: Row[] } | undefined;
    return d?.items ?? [];
  };
  const ms = (n: unknown) => `${Math.round(Number(n ?? 0))}`;
  const kb = (n: unknown) => `${Math.round(Number(n ?? 0) / 1024)}KB`;
  const short = (u: unknown) =>
    String(u ?? "")
      .replace(/^https?:\/\/[^/]+/, "")
      .slice(0, 90);
  const m = items("metrics")[0] ?? {};
  const lines = [
    `simulated: FCP ${ms(m.firstContentfulPaint)} LCP ${ms(m.largestContentfulPaint)} SI ${ms(m.speedIndex)} TTI ${ms(m.interactive)} TBT ${ms(m.totalBlockingTime)}`,
    `observed: TTFB ${ms(m.observedTimeToFirstByte ?? audit("server-response-time")?.numericValue)} FCP ${ms(m.observedFirstContentfulPaint)} LCP ${ms(m.observedLargestContentfulPaint)} load ${ms(m.observedLoad)}`,
  ];
  for (const part of items("lcp-breakdown-insight")) {
    const sub = (part as { items?: Row[]; type?: string }).items;
    if (Array.isArray(sub))
      for (const r of sub) {
        if (r.subpart) lines.push(`lcp ${String(r.subpart)}: ${ms(r.duration)}`);
        const node = r.node as { snippet?: string; nodeLabel?: string } | undefined;
        if (node?.snippet) lines.push(`lcp element: ${node.snippet.slice(0, 160)}`);
      }
    const node = (part as { snippet?: string }).snippet;
    if (node) lines.push(`lcp element: ${node.slice(0, 160)}`);
  }
  const requests = items("network-requests");
  const byType = new Map<string, number>();
  for (const r of requests)
    byType.set(
      String(r.resourceType),
      (byType.get(String(r.resourceType)) ?? 0) + Number(r.transferSize ?? 0),
    );
  lines.push(
    `requests ${requests.length}: ${[...byType].map(([t, n]) => `${t} ${kb(n)}`).join(", ")}`,
  );
  for (const r of [...requests]
    .sort((a, b) => Number(b.transferSize ?? 0) - Number(a.transferSize ?? 0))
    .slice(0, 10))
    lines.push(
      `  ${kb(r.transferSize)} ${String(r.resourceType)} ${String(r.priority)} ${ms(r.networkRequestTime)}-${ms(r.networkEndTime)} ${short(r.url)}`,
    );
  for (const r of items("bootup-time").slice(0, 5))
    lines.push(`  cpu ${ms(r.total)} (script ${ms(r.scripting)}) ${short(r.url)}`);
  for (const r of items("render-blocking-insight").slice(0, 5))
    lines.push(`  blocking ${ms(r.wastedMs)} ${short(r.url)}`);
  return lines.join("\n");
}

test("property page: Core Web Vitals in a Lighthouse mobile run", async ({}, testInfo) => {
  test.skip(process.env.E2E_MODE !== "prod", "Lighthouse measures the production build only");
  test.setTimeout(300_000);
  const { default: lighthouse } = await import("lighthouse");
  const port = 9333;
  const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
  try {
    const url = `http://localhost:${process.env.E2E_PORT ?? 3200}/property/${listingSlug}`;
    // Default config: a mid-range phone on simulated 4G (14 §1). The first run warms the
    // server's resized-image cache (as a CDN would be in production); the second is measured.
    const flags = {
      port,
      output: "json" as const,
      logLevel: "error" as const,
      onlyCategories: ["performance"],
    };
    const warm = await lighthouse(url, flags);
    console.log(
      `[lighthouse] warm-up LCP ${Math.round(warm!.lhr.audits["largest-contentful-paint"]!.numericValue!)} ms`,
    );
    const result = await lighthouse(url, flags);
    const lhr = result!.lhr;
    await testInfo.attach("lighthouse.json", {
      body: JSON.stringify(lhr),
      contentType: "application/json",
    });
    const audits = lhr.audits;
    const lcp = audits["largest-contentful-paint"]!.numericValue!;
    const cls = audits["cumulative-layout-shift"]!.numericValue!;
    const tbt = audits["total-blocking-time"]!.numericValue!;
    // On failure the message carries what made it slow (CI shows it in the annotations).
    const why = lighthouseSummary(lhr);
    const score = Math.round((lhr.categories.performance!.score ?? 0) * 100);
    console.log(`[lighthouse] score ${score}\n${why}`);
    expect(lcp, `LCP\n${why}`).toBeLessThan(2500);
    expect(cls, `CLS\n${why}`).toBeLessThan(0.1);
    // Lab stand-in for INP (< 200 ms in the field).
    expect(tbt, `TBT\n${why}`).toBeLessThan(200);
  } finally {
    await browser.close();
  }
});
