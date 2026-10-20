import { expect, test } from "@playwright/test";
import { db, field, setSettings, signInAsAdmin, snap } from "./helpers";

test("payment plans: template from a built-in one, 100% rule, preview with amounts, delete", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await db().query("delete from payment_plans where is_template");
  await setSettings(request, "market", {
    baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
  });
  await signInAsAdmin(page, request);
  await page.goto("/admin/setup/payment-plans");
  await expect(page.getByRole("heading", { name: "Payment plans", level: 1 })).toBeVisible();
  await expect(page.getByText("No templates of your own yet")).toBeVisible();

  await page.getByRole("button", { name: "New template" }).click();
  const panel = page.getByRole("dialog", { name: "New template" });
  // The drag-and-drop list has its own (empty) live region, so match the total by its text.
  const total = panel.getByRole("status").filter({ hasText: "%" });
  // Nothing typed yet, so the template applies without asking.
  await panel.getByRole("button", { name: "Start from a template" }).click();
  await page.getByRole("menuitem", { name: /^60\/40/ }).click();
  await expect(field(page, "Plan name")).toHaveValue("60/40");
  await expect(total).toHaveText("100%: complete");

  // Lower the handover step: the total says what is missing and saving is refused.
  const step3 = panel.getByRole("group", { name: "Step 3" });
  await step3.getByRole("spinbutton", { name: "Percent" }).fill("30");
  await expect(total).toHaveText("90%: 10% left");
  await panel.getByRole("button", { name: "Save template" }).click();
  await expect(
    panel.getByRole("alert").filter({ hasText: "The steps add up to 90%. Add 10% to reach 100%." }),
  ).toBeVisible();

  // A new step continues from the last stage and takes what is left.
  await panel.getByRole("button", { name: "Add step" }).click();
  const step4 = panel.getByRole("group", { name: "Step 4" });
  await expect(step4.getByRole("combobox", { name: "Stage" })).toHaveText("Post-handover");
  await expect(step4.getByRole("textbox", { name: "Name" })).toHaveValue("After handover");
  await expect(step4.getByRole("spinbutton", { name: "Percent" })).toHaveValue("10");
  await step4.getByRole("textbox", { name: "Timing" }).fill("Within 12 months of handover");
  await step4.getByRole("spinbutton", { name: "Instalments" }).fill("4");
  await expect(total).toHaveText("100%: complete");
  await field(page, "Plan name").fill("60/30/10 post-handover");

  // The preview shows the site's block, with amounts for an example price.
  await panel.getByRole("button", { name: "Preview" }).click();
  await panel.getByRole("spinbutton", { name: "Example price" }).fill("2000000");
  const preview = panel.getByRole("region", { name: "Payment plan" });
  await expect(preview.getByText("90/10 post-handover")).toBeVisible();
  await expect(preview.getByText("AED 600,000", { exact: true })).toBeVisible();
  await expect(preview.getByText("AED 200,000 (4 × about AED 50,000)")).toBeVisible();
  await snap(page, "payment-plan-builder");

  await panel.getByRole("button", { name: "Save template" }).click();
  await expect(panel).toBeHidden();
  const card = page.getByRole("button", { name: /60\/30\/10 post-handover/ });
  await expect(card).toContainText("20% · 40% · 30% · 10% · 90/10 post-handover");

  // Changing an edited plan to another template asks first; cancelling keeps the steps.
  await card.click();
  const edit = page.getByRole("dialog", { name: "Edit 60/30/10 post-handover" });
  await edit.getByRole("button", { name: "Start from a template" }).click();
  await page.getByRole("menuitem", { name: /^1% monthly/ }).click();
  const confirm = page.getByRole("alertdialog", { name: "Use “1% monthly”?" });
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(edit.getByRole("group", { name: "Step 4" })).toBeVisible();
  await expect(edit.getByRole("status").filter({ hasText: "%" })).toHaveText("100%: complete");

  await edit.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText("No templates of your own yet")).toBeVisible();
});
