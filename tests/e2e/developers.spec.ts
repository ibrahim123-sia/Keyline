import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { db, field, signInAsAdmin, snap } from "./helpers";

test("developers: logo from the picker, slug redirect, merge duplicates", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await db().query("delete from developers");
  await db().query("delete from seo_redirects");
  await signInAsAdmin(page, request);
  await page.goto("/admin/setup/developers");
  await expect(page.getByRole("heading", { name: "Developers", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "New developer" }).click();
  const panel = page.getByRole("dialog", { name: "New developer" });
  await field(page, "Name").fill("Azure Coast Developments");
  await field(page, "Website").fill("javascript:alert(1)");
  await page.getByRole("spinbutton", { name: "Founded" }).fill("1999");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel.getByText("Enter a full web address, starting with https://")).toBeVisible();
  await field(page, "Website").fill("https://azure.example");

  // Logo: upload straight from the picker; the new file is selected.
  await panel
    .getByRole("group", { name: "Logo" })
    .getByRole("button", { name: "Choose image" })
    .click();
  const picker = page.getByRole("dialog", { name: "Choose an image" });
  const logo = await sharp({
    create: { width: 240, height: 120, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="240" height="120"><rect x="20" y="20" width="200" height="80" fill="#c96442"/></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
  await picker.getByLabel("Choose files to upload").setInputFiles({
    name: "azure-logo.png",
    mimeType: "image/png",
    buffer: logo,
  });
  await expect(picker.getByRole("button", { name: "azure-logo.png" })).toHaveAttribute(
    "aria-pressed",
    "true",
    { timeout: 90_000 },
  );
  await picker.getByRole("button", { name: "Use this image" }).click();
  await expect(
    panel.getByRole("group", { name: "Logo" }).getByText("azure-logo.png"),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel).toBeHidden();

  const row = page.getByRole("row", { name: /Azure Coast Developments/ });
  await expect(row).toContainText("azure.example");
  await expect(row).toContainText("1999");
  await expect
    .poll(() => row.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await snap(page, "developers");

  // A new slug sends the old page to the new one.
  await row.getByText("Azure Coast Developments").click();
  const edit = page.getByRole("dialog", { name: "Edit Azure Coast Developments" });
  await edit.getByRole("textbox", { name: "URL slug" }).fill("azure-coast");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByRole("row", { name: /\/developers\/azure-coast\b/ })).toBeVisible();

  // A duplicate, merged into the original: its page redirects, without a chain.
  await page.getByRole("button", { name: "New developer" }).click();
  await field(page, "Name").fill("Azure Coast");
  await page
    .getByRole("dialog", { name: "New developer" })
    .getByRole("button", { name: "Save" })
    .click();
  const duplicate = page.getByRole("row", { name: /Azure Coast\s*\/developers\/azure-coast-2/ });
  await expect(duplicate).toBeVisible();
  await duplicate.getByText("Azure Coast", { exact: true }).click();
  const dupPanel = page.getByRole("dialog", { name: "Edit Azure Coast" });
  await dupPanel.getByRole("combobox", { name: "Merge into" }).click();
  await page.getByRole("option", { name: "Azure Coast Developments" }).click();
  await dupPanel.getByRole("button", { name: "Merge" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Merge" }).click();
  await expect(page.getByText("Developers merged")).toBeVisible();
  await expect(page.getByRole("row", { name: /azure-coast-2/ })).toHaveCount(0);

  const redirects = await db().query(
    "select from_path, to_path from seo_redirects order by from_path",
  );
  expect(redirects.rows).toEqual([
    { from_path: "/developers/azure-coast-2", to_path: "/developers/azure-coast" },
    { from_path: "/developers/azure-coast-developments", to_path: "/developers/azure-coast" },
  ]);
});
