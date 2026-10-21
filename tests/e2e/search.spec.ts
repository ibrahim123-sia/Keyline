import { expect, test, type APIRequestContext } from "@playwright/test";
import { clearListings, db, INTERNAL_SECRET, setSettings, snap } from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

/** Data written with SQL skips the app's cache invalidation: expire what search reads. */
async function expire(request: APIRequestContext) {
  const res = await request.post("/api/internal/revalidate", {
    headers: { authorization: `Bearer ${INTERNAL_SECRET}` },
    data: {
      tags: ["search", "listings", "locations", "projects", "developers", "master:property-types"],
    },
  });
  expect(res.ok()).toBe(true);
}

/**
 * 24 homes for sale in "E2E Bay" (one far away, so its pin is never clustered), 2 villas
 * in "E2E Hills", 3 rentals in E2E Bay.
 */
async function seed(request: APIRequestContext) {
  await clearListings();
  await db().query("delete from property_types where slug in ('e2e-flats', 'e2e-villas')");
  await db().query("delete from locations where slug in ('e2e-bay', 'e2e-hills', 'e2e-city')");
  await setSettings(request, "market", {
    baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
    areaUnit: "sqft",
    visitorCurrencies: [],
  });
  const q = async (sql: string, params: unknown[] = []) => (await db().query(sql, params)).rows;
  const [flat] = await q(
    `insert into property_types (id, agency_id, name, slug) values (gen_random_uuid(), $1, 'E2E Flat', 'e2e-flats') returning id`,
    [AGENCY],
  );
  const [villa] = await q(
    `insert into property_types (id, agency_id, name, slug) values (gen_random_uuid(), $1, 'E2E Villa', 'e2e-villas') returning id`,
    [AGENCY],
  );
  const [city] = await q(
    `insert into locations (id, agency_id, level, name, slug) values (gen_random_uuid(), $1, 'city', 'E2E City', 'e2e-city') returning id`,
    [AGENCY],
  );
  const [bay] = await q(
    `insert into locations (id, agency_id, parent_id, level, name, slug, description)
     values (gen_random_uuid(), $1, $2, 'area', 'E2E Bay', 'e2e-bay', 'A calm bay with a long beach walk.') returning id`,
    [AGENCY, city.id],
  );
  const [hills] = await q(
    `insert into locations (id, agency_id, parent_id, level, name, slug) values (gen_random_uuid(), $1, $2, 'area', 'E2E Hills', 'e2e-hills') returning id`,
    [AGENCY, city.id],
  );
  const cols = `id, agency_id, reference, title, slug, purpose, status, published_at, property_type_id, location_id, point, map_pin_exact, price, currency, beds, baths, size`;
  // 23 flats in the bay: beds 1-3, AED 1.1M-3.3M, an hour apart.
  await q(
    `insert into properties (${cols})
     select gen_random_uuid(), $1, 'E2E-' || i, 'Bay flat ' || i, 'e2e-bay-flat-' || i, 'sale', 'available',
       now() - make_interval(hours => i), $2, $3,
       ST_SetSRID(ST_MakePoint(55.14 + i * 0.003, 25.08 + (i % 5) * 0.003), 4326), true,
       (1000000 + i * 100000) * 100, 'AED', (i % 3) + 1, 1, 900 + i
     from generate_series(1, 23) as i`,
    [AGENCY, flat.id, bay.id],
  );
  // The newest one is far away: alone on the map at any zoom that shows them all.
  await q(
    `insert into properties (${cols}) values (gen_random_uuid(), $1, 'E2E-OUT', 'Lone cove flat', 'e2e-lone-cove', 'sale', 'available',
       now(), $2, $3, ST_SetSRID(ST_MakePoint(56.2, 25.7), 4326), true, 95000000, 'AED', 1, 1, 700)`,
    [AGENCY, flat.id, bay.id],
  );
  await q(
    `insert into properties (${cols})
     select gen_random_uuid(), $1, 'E2E-V' || i, 'Hill villa ' || i, 'e2e-hill-villa-' || i, 'sale', 'available',
       now() - make_interval(days => i), $2, $3, ST_SetSRID(ST_MakePoint(55.25, 25.1 + i * 0.01), 4326), true,
       800000000, 'AED', 5, 5, 6000
     from generate_series(1, 2) as i`,
    [AGENCY, villa.id, hills.id],
  );
  await q(
    `insert into properties (${cols})
     select gen_random_uuid(), $1, 'E2E-R' || i, 'Bay rental ' || i, 'e2e-bay-rental-' || i, 'rent', 'available',
       now() - make_interval(hours => i), $2, $3, ST_SetSRID(ST_MakePoint(55.15, 25.09), 4326), true,
       12000000, 'AED', 2, 2, 1100
     from generate_series(1, 3) as i`,
    [AGENCY, flat.id, bay.id],
  );
  await expire(request);
}

test("search: landing pages, filters in the URL, sort, paging, map and autocomplete", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "desktop layout");
  test.setTimeout(300_000);
  await seed(request);

  await page.goto("/buy/e2e-bay");
  await expect(
    page.getByRole("heading", { level: 1, name: "Homes for sale in E2E Bay" }),
  ).toBeVisible();
  await expect(page.getByText("24 homes", { exact: true })).toBeVisible();
  await expect(page.getByText("A calm bay with a long beach walk.")).toBeVisible();
  const results = page.getByRole("region", { name: "Search results" });
  await expect(results.getByText("Showing 1–20 of 24")).toBeVisible();
  await expect(results.getByRole("article").first()).toContainText("Lone cove flat");

  // Beds from the desktop popover: the URL changes and so do the results.
  await page.getByRole("button", { name: "Bedrooms" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "2", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/\/buy\/e2e-bay\?beds=2$/);
  await expect(page.getByText("8 homes", { exact: true })).toBeVisible();
  const chips = page.getByRole("group", { name: "Active filters" });
  await chips.getByRole("link", { name: /2 beds/ }).click();
  await expect(page).toHaveURL(/\/buy\/e2e-bay$/);
  await expect(page.getByText("24 homes", { exact: true })).toBeVisible();

  // Sort and paging are links and URL parameters too.
  await page.getByLabel("Sort").selectOption("price_asc");
  await expect(page).toHaveURL(/sort=price_asc/);
  await expect(results.getByRole("article").first()).toContainText("AED 950,000");
  await page
    .getByRole("navigation", { name: "Pagination" })
    .getByRole("link", { name: "Next" })
    .click();
  await expect(page).toHaveURL(/page=2/);
  await expect(results.getByText("Showing 21–24 of 24")).toBeVisible();

  // Map: the lone listing has its own price pill; hovering it highlights its card.
  await page.goto("/buy/e2e-bay");
  const map = page.getByRole("region", { name: "Map of the results" });
  const lone = map.locator("[data-pin-id]").filter({ hasText: "950K" });
  await expect(lone).toBeVisible({ timeout: 60_000 });
  await lone.hover();
  await expect(results.locator('[data-highlight="true"]')).toContainText("Lone cove flat");
  await lone.click();
  await expect(page.getByRole("region", { name: "Selected home" })).toContainText("Lone cove flat");
  await snap(page, "search-desktop");

  // A type landing route, and real 404s for unknown slugs.
  await page.goto("/buy/e2e-bay/e2e-flats");
  await expect(
    page.getByRole("heading", { level: 1, name: "E2E Flats for sale in E2E Bay" }),
  ).toBeVisible();
  expect((await page.goto("/buy/no-such-place"))?.status()).toBe(404);
  expect((await page.goto("/buy/e2e-bay/no-such-type"))?.status()).toBe(404);

  // Autocomplete forgives a typo; picking an area goes to its landing page.
  await page.goto("/buy");
  const box = page.getByRole("combobox", { name: "Location" });
  await box.fill("e2e bai");
  await page.getByRole("option", { name: /E2E Bay/ }).click();
  await expect(page).toHaveURL(/\/buy\/e2e-bay$/);

  // A reference jumps straight to the listing.
  await page.goto("/buy?ref=e2e-out");
  await expect(page).toHaveURL(/\/property\/e2e-lone-cove$/);
});

test("search on a phone: full-screen map with a card, filter sheet with a live count @phone", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone layout");
  test.setTimeout(300_000);
  await seed(request);

  await page.goto("/buy/e2e-bay");
  await expect(
    page.getByRole("heading", { level: 1, name: "Homes for sale in E2E Bay" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  const overlay = page.getByRole("dialog", { name: "Map of the results" });
  const lone = overlay.locator("[data-pin-id]").filter({ hasText: "950K" });
  await expect(lone).toBeVisible({ timeout: 60_000 });
  await lone.click();
  await expect(overlay.getByRole("region", { name: "Selected home" })).toContainText(
    "Lone cove flat",
  );
  await snap(page, "search-phone-map");
  await overlay.getByRole("button", { name: "List" }).click();
  await expect(overlay).toBeHidden();

  await page.getByRole("button", { name: "Filters" }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await sheet.getByRole("button", { name: "3", exact: true }).click();
  const show = sheet.getByRole("button", { name: "Show 8 homes" });
  await expect(show).toBeVisible();
  await show.click();
  await expect(page).toHaveURL(/beds=3/);
  await expect(page.getByText("8 homes", { exact: true })).toBeVisible();
});
