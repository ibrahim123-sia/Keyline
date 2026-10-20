import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { clearListings, db, setSettings, signInAsAdmin, snap } from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

test("projects: new project, unit types, photo, publish, drafts from unit types", async ({
  page,
  request,
}) => {
  test.setTimeout(360_000);
  await clearListings();
  await db().query("delete from developers where slug = 'e2e-linden'");
  await db().query("delete from property_types where slug = 'e2e-project-apartments'");
  await db().query("delete from locations where slug in ('e2e-creek', 'e2e-bay')");
  await db().query(
    `insert into developers (id, agency_id, name, slug) values (gen_random_uuid(), $1, 'E2E Linden', 'e2e-linden')`,
    [AGENCY],
  );
  await db().query(
    `insert into property_types (id, agency_id, name, slug) values (gen_random_uuid(), $1, 'E2E Project Apartment', 'e2e-project-apartments')`,
    [AGENCY],
  );
  const city = await db().query(
    `insert into locations (id, agency_id, level, name, slug) values (gen_random_uuid(), $1, 'city', 'E2E Bay', 'e2e-bay') returning id`,
    [AGENCY],
  );
  await db().query(
    `insert into locations (id, agency_id, parent_id, level, name, slug) values (gen_random_uuid(), $1, $2, 'area', 'E2E Creek', 'e2e-creek')`,
    [AGENCY, city.rows[0].id],
  );
  await setSettings(request, "market", {
    baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
    areaUnit: "sqft",
  });
  await signInAsAdmin(page, request);

  // New project: name, developer and location; it opens in the editor.
  await page.goto("/admin/projects");
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await dialog.getByRole("textbox", { name: "Project name" }).fill("E2E Linden Residences");
  await dialog.getByRole("combobox", { name: "Developer" }).click();
  await page.getByRole("option", { name: "E2E Linden" }).click();
  await dialog.getByRole("combobox", { name: "Location" }).click();
  await page.getByRole("textbox", { name: "Search locations" }).fill("creek");
  await page.getByRole("option", { name: /E2E Bay › E2E Creek/ }).click();
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: "E2E Linden Residences", level: 1 }),
  ).toBeVisible();

  const panel = page.getByRole("complementary", { name: "Publishing" });
  const missing = panel.getByRole("region", { name: "Before publishing" });
  await expect(missing).toContainText("Drop the pin on the map.");
  await expect(missing).toContainText("Add at least one photo.");
  await expect(panel.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();

  const coords = page.getByRole("textbox", { name: "Coordinates (lat, lng)" });
  await coords.fill("25.2051, 55.3425");
  await coords.blur();

  // A unit type, sized in square feet and priced in AED.
  await page.getByRole("button", { name: "Add unit type" }).click();
  const unit = page.getByRole("group", { name: "Unit type 1" });
  await unit.getByRole("textbox", { name: "Name" }).fill("2 bed type B");
  await unit.getByRole("combobox", { name: "Bedrooms" }).click();
  await page.getByRole("option", { name: "2", exact: true }).click();
  await unit.getByRole("spinbutton", { name: "Size from" }).fill("1100");
  await unit.getByRole("spinbutton", { name: "Price from" }).fill("1800000");
  await unit.getByRole("spinbutton", { name: "Available" }).fill("12");

  // A gallery photo with alt text.
  const photo = await sharp({
    create: { width: 1600, height: 1000, channels: 3, background: { r: 90, g: 130, b: 170 } },
  })
    .jpeg()
    .toBuffer();
  await page.getByLabel("Upload photos").setInputFiles({
    name: "tower.jpg",
    mimeType: "image/jpeg",
    buffer: photo,
  });
  const alt = page.getByRole("textbox", { name: "Alt text: tower.jpg" });
  await expect(alt).toBeVisible({ timeout: 90_000 });
  await alt.fill("The towers at dusk");

  await expect(panel.getByRole("status")).toHaveText(/All changes saved at/, { timeout: 30_000 });
  await expect(missing).toBeHidden();
  await snap(page, "project-editor");

  await panel.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("E2E Linden Residences is published")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Unpublish" })).toBeVisible();

  // Draft listings from the unit type, prefilled from the project.
  await page
    .locator("#units")
    .getByRole("button", { name: "Create listings from unit types" })
    .click();
  const create = page.getByRole("dialog", { name: "Create listings from unit types" });
  await create.getByRole("combobox", { name: "Property type" }).click();
  await page.getByRole("option", { name: "E2E Project Apartment" }).click();
  await create.getByRole("checkbox", { name: "2 bed type B" }).check();
  await create.getByRole("button", { name: "Create 1 draft" }).click();
  const drafts = create.getByRole("region", { name: "New drafts" });
  await expect(
    drafts.getByRole("link", { name: /2 bed type B at E2E Linden Residences/ }),
  ).toBeVisible();
  await create.getByRole("button", { name: "Done" }).click();
  await expect(
    page.locator("#listings").getByRole("link", { name: "2 bed type B at E2E Linden Residences" }),
  ).toBeVisible();

  const rows = await db().query(
    `select p.status, p.completion, p.beds, p.price, p.payment_plan_id, p.project_unit_type_id is not null as linked
       from properties p join projects j on j.id = p.project_id where j.name = 'E2E Linden Residences'`,
  );
  expect(rows.rows).toEqual([
    {
      status: "draft",
      completion: "off_plan",
      beds: 2,
      price: "180000000",
      payment_plan_id: null,
      linked: true,
    },
  ]);

  await page.goto("/admin/projects");
  const row = page.getByRole("row", { name: /E2E Linden Residences/ });
  await expect(row).toContainText("E2E Linden");
  await expect(row).toContainText("E2E Creek");
  await expect(row).toContainText("Published");
});
