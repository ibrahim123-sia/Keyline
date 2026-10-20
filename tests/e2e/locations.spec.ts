import { expect, test } from "@playwright/test";
import { clearListings, db, field, signInAsAdmin, snap } from "./helpers";

test("locations: tree, map point, slug redirect and safe delete", async ({ page, request }) => {
  // First visit compiles the map bundles in dev mode.
  test.setTimeout(240_000);
  await db().query("delete from seo_redirects");
  await clearListings();
  await db().query("delete from locations where parent_id is not null");
  await db().query("delete from locations");
  const mapErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /maplibre|worker|webgl/i.test(m.text())) mapErrors.push(m.text());
  });
  await signInAsAdmin(page, request);
  await page.goto("/admin/setup/locations");

  // Country
  await page.getByRole("button", { name: "New top-level location" }).click();
  // The map really draws: a sized WebGL canvas, and its worker started without errors.
  const canvas = page.locator("canvas.maplibregl-canvas");
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  expect(
    await canvas.evaluate(
      (c: HTMLCanvasElement) => c.clientHeight > 100 && !!c.getContext("webgl2"),
    ),
  ).toBe(true);
  await field(page, "Name").fill("United Arab Emirates");
  await page.getByRole("button", { name: "Save location" }).click();
  await expect(page.getByRole("treeitem", { name: /United Arab Emirates/ })).toBeVisible();

  // City inside it, with a pasted map point
  await page
    .getByRole("button", { name: "Add a location inside United Arab Emirates" })
    .click({ force: true });
  await field(page, "Name").fill("Dubai Marina");
  const coords = page.getByRole("textbox", { name: "Coordinates (lat, lng)" });
  await coords.fill("25.0805, 55.1403");
  await coords.blur();
  await page.getByRole("button", { name: "Save location" }).click();
  await expect(page.getByRole("treeitem", { name: /Dubai Marina/ })).toBeVisible();
  await snap(page, "locations-editor");

  const row = await db().query(
    "select slug, level, ST_AsText(center) as c from locations where name = 'Dubai Marina'",
  );
  expect(row.rows[0]).toMatchObject({
    slug: "dubai-marina",
    level: "city",
    c: "POINT(55.1403 25.0805)",
  });

  // Renaming the slug adds 301s from the old landing pages.
  await page.getByRole("textbox", { name: "URL slug" }).fill("marina");
  await page.getByRole("button", { name: "Save location" }).click();
  await expect
    .poll(
      async () =>
        (await db().query("select from_path, to_path from seo_redirects order by from_path")).rows,
    )
    .toEqual([
      { from_path: "/buy/dubai-marina", to_path: "/buy/marina" },
      { from_path: "/rent/dubai-marina", to_path: "/rent/marina" },
    ]);

  // A location with children cannot be deleted.
  await page.getByRole("button", { name: /^United Arab Emirates Country/ }).click();
  await expect(page.getByRole("heading", { name: "Edit United Arab Emirates" })).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(/Still used by 1 sub-locations/)).toBeVisible();
  expect(mapErrors).toEqual([]);
});
