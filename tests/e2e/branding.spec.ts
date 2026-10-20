import { expect, test } from "@playwright/test";
import { db, signInAsAdmin, snap } from "./helpers";

test("branding: contrast warning, live preview, save to the site, reset", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await db().query(`delete from settings where "group" = 'branding'`);
  await signInAsAdmin(page, request);
  await page.goto("/admin/settings/branding");
  await expect(page.getByRole("heading", { name: "Branding", level: 1 })).toBeVisible();
  const status = page.getByRole("status").filter({ hasText: /pairs/ });
  await expect(status).toHaveText(/All \d+ pairs pass/);

  // exact: the colour picker next to it is named "Pick colour: Accent (buttons, links)".
  const accent = page.getByRole("textbox", { name: "Accent (buttons, links)", exact: true });
  const previewButton = page
    .getByRole("complementary", { name: "Live preview" })
    .getByText("Book a viewing");

  // A pale accent fails the check; the preview follows as you type.
  await accent.fill("#F2D7C9");
  await expect(status).toHaveText(/pairs are too low/);
  await expect(previewButton).toHaveCSS("background-color", "rgb(242, 215, 201)");

  // A strong blue passes, and is saved for the whole site.
  await accent.fill("#1F5F8B");
  await expect(status).toHaveText(/All \d+ pairs pass/);
  await expect(previewButton).toHaveCSS("background-color", "rgb(31, 95, 139)");
  await snap(page, "branding");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();

  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--color-accent")
          .trim()
          .toLowerCase(),
      ),
    )
    .toBe("#1f5f8b");

  // Reset puts the defaults back in the form (saved only on Save).
  await page.goto("/admin/settings/branding");
  await page.getByRole("button", { name: "Reset to Desert Modern" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reset" }).click();
  await expect(accent).toHaveValue("#A9502F");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  const stored = await db().query(`select value from settings where "group" = 'branding'`);
  expect(stored.rows[0]!.value.colors.accent).toBe("#A9502F");
});
