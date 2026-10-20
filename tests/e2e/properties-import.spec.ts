import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { db, setSettings, signInAsAdmin, snap } from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

async function cleanUp() {
  await db().query("delete from properties where source = 'import'");
  await db().query("delete from property_types where slug = 'e2e-townhouses'");
  await db().query("delete from locations where slug = 'e2e-palm-bay'");
}

/** A file as an agency might have it: its own headers, one column to skip, one bad row. */
const csv = [
  "Listing title,Offering type,Type,Community,Asking price,Bedrooms,Size (sq ft),Notes",
  'Palm Bay villa,sale,E2E Townhouse,E2E Palm Bay,"3,200,000",4,2800,ignore me',
  "Sea breeze flat,rent,E2E Townhouse,E2E Palm Bay,120000,2,1100,",
  "Broken row,sale,Castle,E2E Palm Bay,1000000,3,1500,",
].join("\r\n");

test("properties import: template, columns, preview with a bad row, drafts, export", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await cleanUp();
  await db().query(
    `insert into property_types (id, agency_id, name, slug) values (gen_random_uuid(), $1, 'E2E Townhouse', 'e2e-townhouses')`,
    [AGENCY],
  );
  await db().query(
    `insert into locations (id, agency_id, level, name, slug) values (gen_random_uuid(), $1, 'area', 'E2E Palm Bay', 'e2e-palm-bay')`,
    [AGENCY],
  );
  await setSettings(request, "market", {
    areaUnit: "sqft",
    rentPeriod: "year",
    baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
  });
  await signInAsAdmin(page, request);

  await page.goto("/admin/properties");
  await page.getByRole("link", { name: "Import", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import properties", level: 1 })).toBeVisible();

  // The template has one header row and an example, in the market's area unit.
  const templateDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download template" }).click();
  const template = await templateDownload;
  expect(template.suggestedFilename()).toBe("properties-template.csv");
  const [header, example] = (await readFile((await template.path())!, "utf8"))
    .replace(/^﻿/, "")
    .split("\r\n");
  expect(header!.startsWith("title,purpose,completion,property_type,location")).toBe(true);
  expect(header).toContain("size_sqft");
  expect(header).not.toContain("size_sqm");
  expect(example).toContain("sale");

  await page.getByLabel("Choose a CSV file").setInputFiles({
    name: "listings.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  // Columns with known names are matched; the rest stay out.
  await expect(page.getByRole("heading", { name: "Match the columns" })).toBeVisible();
  await expect(page.getByText("listings.csv: 3 listings.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Import “Listing title” as" })).toHaveValue(
    "title",
  );
  await expect(page.getByRole("combobox", { name: "Import “Size (sq ft)” as" })).toHaveValue(
    "size_sqft",
  );
  await expect(page.getByRole("combobox", { name: "Import “Notes” as" })).toHaveValue("");
  // Unmatching a required column blocks the next step until it is chosen again.
  await page.getByRole("combobox", { name: "Import “Type” as" }).selectOption("");
  await expect(page.getByText("Choose the column for “Property type”.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check the rows" })).toBeDisabled();
  await page.getByRole("combobox", { name: "Import “Type” as" }).selectOption("property_type");
  await page.getByRole("button", { name: "Check the rows" }).click();

  // The preview names the bad row and why; only good rows are imported.
  await expect(page.getByRole("heading", { name: "Check before importing" })).toBeVisible();
  await expect(page.getByText("2 rows are ready to import")).toBeVisible();
  const bad = page.getByRole("row", { name: /Broken row/ });
  await expect(bad).toContainText(
    "Property type “Castle” is not set up (Setup -> Property types).",
  );
  await page.getByLabel("Only show rows with problems").check();
  await expect(page.getByRole("row", { name: /Palm Bay villa/ })).toBeHidden();
  await expect(bad).toBeVisible();
  await page.getByLabel("Only show rows with problems").uncheck();
  await expect(page.getByRole("row", { name: /Palm Bay villa/ })).toContainText("AED 3,200,000");
  await snap(page, "properties-import-preview");

  await page.getByRole("button", { name: "Import 2 drafts" }).click();
  await expect(page.getByRole("heading", { name: "Import finished" })).toBeVisible();
  await expect(page.getByText("2 drafts created.")).toBeVisible();
  const created = page.getByRole("list", { name: "New drafts" });
  await expect(created.getByRole("link")).toHaveCount(2);
  await expect(created).toContainText("Palm Bay villa");

  // The drafts are in the list, in stored units.
  await page.getByRole("link", { name: "See the drafts" }).click();
  await expect(page).toHaveURL(/\/admin\/properties\?status=draft$/);
  await expect(page.getByRole("row", { name: /Palm Bay villa/ })).toContainText("AED 3,200,000");
  await expect(page.getByRole("row", { name: /Sea breeze flat/ })).toContainText(
    "AED 120,000 / year",
  );
  const stored = await db().query(
    "select title, status, round(size::numeric, 2) as size, price from properties where source = 'import' order by title",
  );
  expect(stored.rows).toEqual([
    { title: "Palm Bay villa", status: "draft", size: "260.13", price: "320000000" },
    { title: "Sea breeze flat", status: "draft", size: "102.19", price: "12000000" },
  ]);

  // Export what the list shows (drafts) and read it back.
  const exportDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  const exported = await exportDownload;
  expect(exported.suggestedFilename()).toMatch(/^properties-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = (await readFile((await exported.path())!, "utf8")).replace(/^﻿/, "");
  const lines = text.trim().split("\r\n");
  expect(lines[0]!.startsWith("reference,status,title,purpose")).toBe(true);
  const villa = lines.find((l) => l.includes("Palm Bay villa"))!;
  expect(villa).toContain(",draft,Palm Bay villa,sale,ready,E2E Townhouse,E2E Palm Bay,");
  expect(villa).toContain(",3200000,AED,");

  await cleanUp();
});
