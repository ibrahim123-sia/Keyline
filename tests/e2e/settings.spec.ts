import { expect, test } from "@playwright/test";
import { db, field, signInAsAdmin, snap } from "./helpers";

test("settings: save a tab, see it on the site, field errors on nested fields", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await db().query(`delete from settings where "group" in ('general', 'market')`);
  await signInAsAdmin(page, request);

  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/admin\/settings\/general$/);
  await expect(page.getByRole("heading", { name: "General", level: 1 })).toBeVisible();
  const save = page.getByRole("button", { name: "Save changes" });
  await expect(save).toBeDisabled();

  await field(page, "Agency name").fill("Haven & Dune");
  await expect(page.getByRole("status").filter({ hasText: "Unsaved changes" })).toBeVisible();
  await save.click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await expect(save).toBeDisabled();
  await snap(page, "settings-general");

  // The public site picks it up (cache tag refreshed on save).
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Haven & Dune, home" }).first()).toBeVisible();

  // Market: a nested field error lands next to the field (the first "Code" is the base currency).
  await page.goto("/admin/settings/market");
  await page.getByRole("textbox", { name: "Code" }).first().fill("US");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Use the three-letter currency code (ISO 4217)")).toBeVisible();
  await page.getByRole("textbox", { name: "Code" }).first().fill("EUR");
  await page.getByRole("textbox", { name: "Symbol" }).first().fill("€");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  const stored = await db().query(`select value from settings where "group" = 'market'`);
  expect(stored.rows[0]!.value.baseCurrency).toMatchObject({ code: "EUR", symbol: "€" });

  // Discard puts back the saved values.
  await page.getByRole("textbox", { name: "Symbol" }).first().fill("X");
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByRole("textbox", { name: "Symbol" }).first()).toHaveValue("€");
});
