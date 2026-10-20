import { expect, test } from "@playwright/test";
import { db, field, signInAsAdmin, snap } from "./helpers";

test("places: add by hand with a pasted point, list, and hide in bulk", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  await db().query("delete from pois");
  await db().query("delete from poi_types");
  await db().query(
    `insert into poi_types (id, agency_id, name, icon, category, google_place_type, default_search_radius_m, show_on_property, travel_mode, sort_order)
     values (gen_random_uuid(), $1, 'Metro station', 'metro', 'transport', 'subway_station', 2000, true, 'walk', 0)`,
    [process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001"],
  );
  await signInAsAdmin(page, request);
  await page.goto("/admin/setup/pois");
  await expect(page.getByRole("heading", { name: "Places (POIs)" })).toBeVisible();

  await page.getByRole("button", { name: "New place" }).click();
  const panel = page.getByRole("dialog", { name: "New place" });
  await field(page, "Name").fill("DMCC Metro Station");
  await field(page, "Address").fill("Sheikh Zayed Road");
  const coords = panel.getByRole("textbox", { name: "Coordinates (lat, lng)" });
  await coords.fill("25.0709, 55.1386");
  await coords.blur();
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel).toBeHidden();

  const row = page.getByRole("row", { name: /DMCC Metro Station/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Metro station");
  await snap(page, "pois-table");

  const stored = await db().query(
    "select ST_AsText(point) as p, is_active from pois where name = 'DMCC Metro Station'",
  );
  expect(stored.rows[0]).toEqual({ p: "POINT(55.1386 25.0709)", is_active: true });

  await row.getByRole("checkbox", { name: "Select row" }).check();
  await page
    .getByRole("region", { name: "Bulk actions" })
    .getByRole("button", { name: "Hide" })
    .click();
  await expect(row).toContainText("Hidden");
});
