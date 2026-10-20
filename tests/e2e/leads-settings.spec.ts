import { expect, test } from "@playwright/test";
import { db, field, signInAsAdmin } from "./helpers";

test("leads settings: default pipeline, edit and delete stages, assignment rule", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await db().query("delete from lead_stages");
  await db().query(`delete from settings where "group" = 'leads'`);
  await signInAsAdmin(page, request);
  await page.goto("/admin/settings/leads");

  await page.getByRole("button", { name: "Use the default stages" }).click();
  await expect(page.getByText("Pipeline created")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Offer" })).toBeVisible();

  await page.getByRole("button", { name: "Edit Offer" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit stage" });
  await field(page, "Name").fill("Negotiation");
  await dialog.getByRole("button", { name: "Save stage" }).click();
  await expect(page.getByText("Stage saved")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Negotiation" })).toBeVisible();

  await page.getByRole("button", { name: "Delete Viewing" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Stage deleted")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Viewing" })).toHaveCount(0);
  const stages = await db().query("select name from lead_stages order by sort_order");
  expect(stages.rows.map((r) => r.name)).toEqual([
    "New",
    "Contacted",
    "Negotiation",
    "Won",
    "Lost",
  ]);

  await page.getByRole("combobox", { name: "Who gets a new lead" }).click();
  await page.getByRole("option", { name: "Active agents in turn (round robin)" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  const stored = await db().query(`select value from settings where "group" = 'leads'`);
  expect(stored.rows[0]!.value.assignmentRule).toBe("round_robin");
});
