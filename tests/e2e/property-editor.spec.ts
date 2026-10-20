import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { clearListings, db, field, setSettings, signInAsAdmin, snap } from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

test("property editor: new draft, fill the required sections, autosave, publish", async ({
  page,
  request,
}) => {
  test.setTimeout(360_000);
  await clearListings();
  await db().query("delete from property_types where slug = 'e2e-apartments'");
  await db().query("delete from locations where slug in ('e2e-marina', 'e2e-coast')");
  await db().query(
    `insert into property_types (id, agency_id, name, slug) values (gen_random_uuid(), $1, 'E2E Apartment', 'e2e-apartments')`,
    [AGENCY],
  );
  const city = await db().query(
    `insert into locations (id, agency_id, level, name, slug) values (gen_random_uuid(), $1, 'city', 'E2E Coast', 'e2e-coast') returning id`,
    [AGENCY],
  );
  await db().query(
    `insert into locations (id, agency_id, parent_id, level, name, slug) values (gen_random_uuid(), $1, $2, 'area', 'E2E Marina', 'e2e-marina')`,
    [AGENCY, city.rows[0].id],
  );
  await setSettings(request, "market", {
    baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
    areaUnit: "sqft",
  });
  await signInAsAdmin(page, request);

  // New property: a draft with the next reference, opened in the editor.
  await page.goto("/admin/properties");
  await page.getByRole("button", { name: "New property" }).click();
  const dialog = page.getByRole("dialog", { name: "New property" });
  await dialog.getByRole("combobox", { name: "Property type" }).click();
  await page.getByRole("option", { name: "E2E Apartment" }).click();
  await dialog.getByRole("textbox", { name: "Title" }).fill("Canal view apartment");
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/properties\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Canal view apartment", level: 1 })).toBeVisible();

  const panel = page.getByRole("complementary", { name: "Publishing" });
  const missing = panel.getByRole("region", { name: "Before publishing" });
  await expect(missing).toContainText("Choose the location.");
  await expect(missing).toContainText("Add at least one photo.");
  await expect(panel.getByRole("button", { name: "Publish" })).toBeDisabled();

  // Location: tree search, then a pasted pin.
  await page.getByRole("combobox", { name: "Location" }).click();
  await page.getByRole("textbox", { name: "Search locations" }).fill("marina");
  await page.getByRole("option", { name: /E2E Coast › E2E Marina/ }).click();
  const coords = page.getByRole("textbox", { name: "Coordinates (lat, lng)" });
  await coords.fill("25.0805, 55.1403");
  await coords.blur();

  // Price and specs (size in square feet, stored in square metres).
  await page.getByRole("spinbutton", { name: "Price", exact: true }).fill("2450000");
  await page.getByRole("combobox", { name: "Bedrooms" }).click();
  await page.getByRole("option", { name: "2", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Bathrooms" }).fill("2");
  await page.getByRole("spinbutton", { name: "Size", exact: true }).fill("1200");

  // A photo, uploaded straight into the gallery, with alt text.
  const photo = await sharp({
    create: { width: 1600, height: 1000, channels: 3, background: { r: 120, g: 160, b: 190 } },
  })
    .jpeg()
    .toBuffer();
  await page.getByLabel("Upload photos").setInputFiles({
    name: "canal.jpg",
    mimeType: "image/jpeg",
    buffer: photo,
  });
  const alt = page.getByRole("textbox", { name: "Alt text: canal.jpg" });
  await expect(alt).toBeVisible({ timeout: 90_000 });
  await alt.fill("Living room with canal view");
  await expect(page.getByRole("button", { name: "Cover photo: canal.jpg" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Drafts save on their own.
  await expect(panel.getByRole("status")).toHaveText(/All changes saved at/, { timeout: 30_000 });
  await expect(missing).toBeHidden();
  await snap(page, "property-editor");

  // Leaving with unsaved changes asks first.
  await field(page, "Title").fill("Canal view apartment with study");
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Properties" })
    .click();
  const leave = page.getByRole("alertdialog", { name: "Leave without saving?" });
  await leave.getByRole("button", { name: "Cancel" }).click();
  await page.keyboard.press("Control+s");
  await expect(panel.getByRole("status")).toHaveText(/All changes saved at/);

  await panel.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/is live$/)).toBeVisible();
  await expect(panel.getByRole("combobox", { name: "Change status" })).toHaveValue("available");
  await expect(panel.getByRole("button", { name: "Unpublish" })).toBeVisible();

  const row = await db().query(
    `select status, published_at, size, price, slug, original_price from properties where title = 'Canal view apartment with study'`,
  );
  expect(row.rows[0]).toMatchObject({
    status: "available",
    price: "245000000",
    original_price: "245000000",
    slug: "canal-view-apartment-with-study",
  });
  expect(Number(row.rows[0].size)).toBeCloseTo(111.48, 1);

  await page.goto("/admin/properties");
  const listRow = page.getByRole("row", { name: /Canal view apartment with study/ });
  await expect(listRow).toContainText("Available");
  await expect(listRow).toContainText("AED 2,450,000");
  await expect(listRow).toContainText("E2E Marina");
});
