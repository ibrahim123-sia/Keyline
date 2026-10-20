import { expect, test } from "@playwright/test";
import { clearListings, db, setSettings, signInAsAdmin, snap } from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

/** Phase 3 checklist: moving the pin measures nearby places; a lower price is recorded. */
test("live listing: moving the pin measures nearby places, a lower price adds Price reduced", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await clearListings();
  await db().query("delete from pois where name = 'E2E Canal School'");
  await db().query("delete from poi_types where name = 'E2E School'");
  await db().query("delete from badges where name = 'E2E Price reduced'");
  await db().query("delete from secrets where key like 'google_maps%'");
  await setSettings(request, "market", {
    baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
    distanceUnit: "km",
  });
  const q = async (sql: string, params: unknown[] = []) => (await db().query(sql, params)).rows;
  const [type] = await q(
    `insert into property_types (id, agency_id, name, slug) values (gen_random_uuid(), $1, 'E2E Villa', 'e2e-villas-' || floor(random()*1e6)) returning id`,
    [AGENCY],
  );
  const [area] = await q(
    `insert into locations (id, agency_id, level, name, slug) values (gen_random_uuid(), $1, 'area', 'E2E Canal', 'e2e-canal-' || floor(random()*1e6)) returning id`,
    [AGENCY],
  );
  const [poiType] = await q(
    `insert into poi_types (id, agency_id, name, icon, category, default_search_radius_m, show_on_property, travel_mode, sort_order)
     values (gen_random_uuid(), $1, 'E2E School', 'school', 'schools', 3000, true, 'drive', 0) returning id`,
    [AGENCY],
  );
  await q(
    `insert into pois (id, agency_id, poi_type_id, name, point, is_active)
     values (gen_random_uuid(), $1, $2, 'E2E Canal School', ST_SetSRID(ST_MakePoint(55.1440, 25.0870), 4326), true)`,
    [AGENCY, poiType.id],
  );
  await q(
    `insert into badges (id, agency_id, name, auto_rule, auto_days) values (gen_random_uuid(), $1, 'E2E Price reduced', 'price_reduced', 30)`,
    [AGENCY],
  );
  const [photo] = await q(
    `insert into media (id, agency_id, r2_key, file_name, mime, status, alt)
     values (gen_random_uuid(), $1, '2026/10/e2enearby1/front.jpg', 'front.jpg', 'image/jpeg', 'ready', 'Front of the villa') returning id`,
    [AGENCY],
  );
  // A live listing far from the school; its pin is about to move next to it.
  const [listing] = await q(
    `insert into properties (id, agency_id, reference, title, slug, purpose, status, property_type_id, location_id, point,
       price, currency, beds, baths, size, published_at, original_price)
     values (gen_random_uuid(), $1, 'E2E-1', 'Canal villa', 'canal-villa', 'sale', 'available', $2, $3,
       ST_SetSRID(ST_MakePoint(55.30, 25.20), 4326), 245000000, 'AED', 4, 4, 350, now() - interval '2 days', 245000000)
     returning id`,
    [AGENCY, type.id, area.id],
  );
  await q(
    `insert into property_media (id, agency_id, property_id, media_id, kind, sort_order, is_cover)
     values (gen_random_uuid(), $1, $2, $3, 'photo', 0, true)`,
    [AGENCY, listing.id, photo.id],
  );

  await signInAsAdmin(page, request);
  await page.goto(`/admin/properties/${listing.id}`);
  await expect(page.getByRole("heading", { name: "Canal villa", level: 1 })).toBeVisible();
  const panel = page.getByRole("complementary", { name: "Publishing" });
  const nearby = page.locator("#nearby");
  await expect(nearby).not.toContainText("E2E Canal School");

  // Move the pin next to the school: saved by autosave, then measured in the background.
  const coords = page.getByRole("textbox", { name: "Coordinates (lat, lng)" });
  await coords.fill("25.0805, 55.1403");
  await coords.blur();
  await expect(panel.getByRole("status")).toHaveText(/All changes saved at/, { timeout: 30_000 });
  await expect(nearby).toContainText("E2E Canal School", { timeout: 30_000 });
  // No Google key in this environment: straight-line distances, said plainly.
  await expect(nearby.getByRole("note")).toContainText("Straight-line distances only.");
  await expect(nearby).toContainText(/\d+ m|\d(\.\d)? km/);
  await snap(page, "property-nearby");

  // A lower price on a live listing: history and the automatic badge.
  await page.getByRole("spinbutton", { name: "Price", exact: true }).fill("2300000");
  await expect(panel.getByRole("status")).toHaveText(/All changes saved at/, { timeout: 30_000 });
  await page.reload();
  const activity = page.locator("#activity");
  await expect(activity).toContainText("AED 2,450,000");
  await expect(activity).toContainText("AED 2,300,000");
  const badges = page.locator("#badges");
  await expect(badges).toContainText("E2E Price reduced");
  await expect(badges).toContainText(/Price lowered/);
});
