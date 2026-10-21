import { chromium, expect, test, type Page } from "@playwright/test";
import { clearListings, db, publicTags, revalidateTags, seedDemo } from "./helpers";

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
  const missing = await page.goto("/no-such-page-here");
  expect(missing?.status()).toBe(404);
});

test("property page: Core Web Vitals in a Lighthouse mobile run", async () => {
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
    const audits = result!.lhr.audits;
    const lcp = audits["largest-contentful-paint"]!.numericValue!;
    const cls = audits["cumulative-layout-shift"]!.numericValue!;
    const tbt = audits["total-blocking-time"]!.numericValue!;
    console.log(
      `[lighthouse] LCP ${Math.round(lcp)} ms, CLS ${cls.toFixed(3)}, TBT ${Math.round(tbt)} ms, score ${Math.round((result!.lhr.categories.performance!.score ?? 0) * 100)}`,
    );
    expect(lcp, "LCP").toBeLessThan(2500);
    expect(cls, "CLS").toBeLessThan(0.1);
    // Lab stand-in for INP (< 200 ms in the field).
    expect(tbt, "TBT").toBeLessThan(200);
  } finally {
    await browser.close();
  }
});
