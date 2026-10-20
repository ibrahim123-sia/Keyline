import { expect, test } from "@playwright/test";
import { db, field, signInAsAdmin } from "./helpers";

test.describe("Phase 2: master data", () => {
  test.beforeAll(async () => {
    await db().query("delete from facilities");
    await db().query("delete from badges");
  });

  test("create, edit and safely delete facilities", async ({ page, request }) => {
    await signInAsAdmin(page, request);
    await page.goto("/admin/setup/facilities");
    await expect(page.getByRole("heading", { name: "Facilities", exact: true })).toBeVisible();

    for (const name of ["Swimming pool", "Gym"]) {
      await page.getByRole("button", { name: "New facility" }).first().click();
      const panel = page.getByRole("dialog", { name: "New facility" });
      await field(panel.page(), "Name").fill(name);
      await panel.getByRole("button", { name: "Save" }).click();
      await expect(panel).toBeHidden();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    // Edit
    await page.getByRole("button", { name: "Edit Gym" }).click();
    const edit = page.getByRole("dialog", { name: "Edit facility" });
    await field(edit.page(), "Name").fill("Fitness centre");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Fitness centre", { exact: true })).toBeVisible();

    // Unused items can be deleted after confirming.
    await page.getByRole("button", { name: "Delete Fitness centre" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Fitness centre", { exact: true })).toBeHidden();

    // The change is in the audit log.
    const audit = await db().query(
      "select action from audit_log where entity_type = 'facility' order by created_at",
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      "facility.create",
      "facility.create",
      "facility.update",
      "facility.delete",
    ]);
  });

  test("badges refuse colours below 4.5:1 contrast", async ({ page, request }) => {
    await signInAsAdmin(page, request);
    await page.goto("/admin/setup/badges");
    await page.getByRole("button", { name: "New badge" }).first().click();
    const panel = page.getByRole("dialog", { name: "New badge" });
    await field(panel.page(), "Name").fill("Hot deal");
    await field(panel.page(), "Text colour").fill("#EDE5DA");
    await panel.getByRole("button", { name: "Save" }).click();
    await expect(panel.getByText("Text and background need at least 4.5:1 contrast")).toBeVisible();

    await field(panel.page(), "Text colour").fill("#14232B");
    await panel.getByRole("button", { name: "Save" }).click();
    await expect(panel).toBeHidden();
    await expect(page.getByText("Hot deal")).toBeVisible();
  });
});
