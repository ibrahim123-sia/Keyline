import { expect, test } from "@playwright/test";
import { field, signInAsAdmin } from "./helpers";

test("audit log: a settings change shows who, what, before and after", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await signInAsAdmin(page, request);
  const legalName = `Harbour Homes ${Date.now()} LLC`;
  await page.goto("/admin/settings/general");
  await field(page, "Legal name").fill(legalName);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();

  await page.goto("/admin/settings/audit?module=settings");
  await expect(page.getByRole("heading", { name: "Audit log", level: 1 })).toBeVisible();
  const row = page.getByRole("row", { name: /Settings changed/ }).first();
  await expect(row).toContainText("Admin E2E");
  await expect(row).toContainText("legalName");
  await row.click();
  const panel = page.getByRole("dialog", { name: "Settings changed" });
  const change = panel.getByRole("row", { name: /legalName/ });
  await expect(change).toContainText(legalName);
  await expect(panel.getByText("settings.update")).toBeVisible();
});
