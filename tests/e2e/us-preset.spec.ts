import { expect, test } from "@playwright/test";
import {
  clearLeads,
  clearListings,
  db,
  publicTags,
  revalidateTags,
  seedDemo,
  signInAsAdmin,
  watchCsp,
} from "./helpers";

/**
 * 16 §2 / Phase 10 done-when: the US preset changes currency, units and labels with no code
 * changes; and with real data the main pages load with no Content-Security-Policy violations.
 */
test.describe.configure({ mode: "serial" });

let slug = "";

test.beforeAll(async ({ request }) => {
  test.setTimeout(900_000);
  await seedDemo(request, "us-demo");
  const { rows } = await db().query(
    `select p.slug from properties p
       where p.purpose = 'sale' and p.completion = 'ready' and p.status = 'available'
         and exists (select 1 from property_media m where m.property_id = p.id and m.kind = 'photo')
       order by p.is_featured desc, p.published_at desc limit 1`,
  );
  slug = rows[0].slug;
  // The dev server compiles each route on its first visit (minutes on a busy machine).
  for (const path of ["/", "/buy", "/rent", `/property/${slug}`])
    await request.get(path, { timeout: 240_000 });
});

test.afterAll(async ({ request }) => {
  await clearLeads();
  await clearListings();
  for (const t of [
    "posts",
    "post_categories",
    "post_tags",
    "faqs",
    "testimonials",
    "pages",
    "settings",
  ])
    await db().query(`delete from ${t}`);
  await revalidateTags(request, publicTags);
});

test("a US-preset property page shows dollars, square feet and miles", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop layout");
  test.setTimeout(240_000);
  await page.goto(`/property/${slug}`);
  const main = page.getByRole("main");
  await expect(main).toContainText("$");
  await expect(main).toContainText("sq ft");
  await expect(main).not.toContainText("AED");
  await expect(page.getByRole("region", { name: "Location and nearby" })).toContainText(" mi");
  // Permit field is off in this market.
  await expect(main).not.toContainText("Permit no.");

  await page.goto("/rent");
  await expect(page.getByRole("main")).toContainText("/ month");
});

test("home, search map, property gallery and map, and admin load with no CSP violations", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop run is enough");
  test.setTimeout(420_000);
  const violations = await watchCsp(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find your place in Austin");

  await page.goto("/buy");
  const map = page.getByRole("region", { name: "Map of the results" });
  await map.scrollIntoViewIfNeeded();
  await expect(map.locator("canvas.maplibregl-canvas").first()).toBeVisible({ timeout: 60_000 });

  await page.goto(`/property/${slug}`);
  await page.getByRole("button", { name: /^All photos \(\d+\)$/ }).click();
  await expect(page.getByRole("dialog", { name: /^Photos of/ })).toBeVisible();
  await page.keyboard.press("Escape");
  const nearby = page.getByRole("region", { name: "Location and nearby" });
  await nearby.scrollIntoViewIfNeeded();
  await expect(nearby.locator("canvas.maplibregl-canvas").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState("networkidle");

  await signInAsAdmin(page, request);
  await page.goto("/admin/properties");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(await violations()).toEqual([]);
});
