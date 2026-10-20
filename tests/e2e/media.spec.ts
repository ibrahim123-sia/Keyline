import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { clearListings, db, field, signInAsAdmin, snap } from "./helpers";

const OWNER = "E2E Camera Owner";

async function photoWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 1600, height: 1000, channels: 3, background: "#b8865b" } })
    .withExifMerge({
      IFD0: { Copyright: OWNER },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "25/1 4/1 50/1" },
    })
    .jpeg()
    .toBuffer();
}

test("media library: upload, strip location data, edit, crop, use in a page, safe delete", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await clearListings();
  await db().query("delete from media");
  await db().query("delete from locations");
  await db().query("delete from seo_redirects");
  await signInAsAdmin(page, request);
  await page.goto("/admin/media");
  await expect(page.getByRole("heading", { name: "Media", level: 1 })).toBeVisible();
  await expect(page.getByText("No files here yet")).toBeVisible();

  // Upload a photo with GPS data and a PDF.
  const jpeg = await photoWithGps();
  expect(jpeg.includes(OWNER)).toBe(true);
  await page.getByLabel("Choose files to upload").setInputFiles([
    { name: "Marina Terrace.jpg", mimeType: "image/jpeg", buffer: jpeg },
    {
      name: "Brochure.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\ntrailer\n%%EOF\n"),
    },
  ]);
  const uploads = page.getByRole("region", { name: "Uploads" });
  await expect(uploads.getByRole("status")).toHaveText("2 uploaded", { timeout: 90_000 });

  const files = page.getByRole("list", { name: "Files" });
  const photoTile = files.getByRole("listitem").filter({ hasText: "Marina Terrace.jpg" });
  await expect(photoTile).toBeVisible();
  await expect(photoTile.getByText("No alt text")).toBeVisible();
  await expect(photoTile.getByText("1600×1000")).toBeVisible();
  // The thumbnail really loads (resized by Next's optimizer in dev).
  await expect
    .poll(() => photoTile.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  // The stored file has no location data left.
  const [row] = (
    await db().query("select r2_key, size_bytes from media where file_name = 'Marina Terrace.jpg'")
  ).rows as Array<{ r2_key: string; size_bytes: string }>;
  const served = await request.get(`/media/${row!.r2_key}`);
  expect(served.status()).toBe(200);
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");
  const body = await served.body();
  expect(body.includes(OWNER)).toBe(false);
  expect(body.length).toBe(Number(row!.size_bytes));
  await snap(page, "media-grid");

  // Alt text and folder.
  await photoTile.getByRole("button", { name: "Open Marina Terrace.jpg" }).click();
  const panel = page.getByRole("dialog", { name: "Marina Terrace.jpg" });
  await field(page, "Alt text").fill("Terrace with a marina view at sunset");
  // By label: with folder suggestions (a datalist) the input is a combobox, without it a textbox.
  await panel.getByLabel("Folder").fill("Listings / Marina");
  await panel.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("File details saved")).toBeVisible();

  // Square crop moved with the keyboard.
  await panel.getByRole("tab", { name: "1:1" }).click();
  const crop = panel.getByRole("group", { name: /Square 1:1 crop/ });
  await crop.focus();
  await crop.press("Shift+ArrowLeft");
  await crop.press("Shift+ArrowLeft");
  await panel.getByRole("button", { name: "Save crops" }).click();
  await expect(page.getByText("Crops saved")).toBeVisible();
  const crops = (await db().query("select crops from media where file_name = 'Marina Terrace.jpg'"))
    .rows[0]!.crops as Record<string, { x: number; w: number }>;
  expect(crops["1:1"]!.w).toBeCloseTo(1000 / 1600, 3);
  expect(crops["1:1"]!.x).toBeCloseTo((1 - 1000 / 1600) / 2 - 0.1, 3);
  await snap(page, "media-details");
  await page.keyboard.press("Escape");

  const folders = page.getByRole("navigation", { name: "Folders" });
  await expect(folders.getByRole("button", { name: /Marina/ })).toBeVisible();
  await expect(photoTile.getByText("No alt text")).toHaveCount(0);

  // Use the photo as a location's share image, through the media picker.
  await page.goto("/admin/setup/locations");
  await page.getByRole("button", { name: "New top-level location" }).click();
  await field(page, "Name").fill("Test Emirate");
  await page.getByRole("button", { name: "Choose image" }).click();
  const picker = page.getByRole("dialog", { name: "Choose an image" });
  await picker.getByRole("button", { name: "Marina Terrace.jpg" }).click();
  await picker.getByRole("button", { name: "Use this image" }).click();
  await expect(picker).toBeHidden();
  await expect(page.getByRole("button", { name: "Change image" })).toBeVisible();
  await page.getByRole("button", { name: "Save location" }).click();
  await expect(page.getByRole("treeitem", { name: /Test Emirate/ })).toBeVisible();

  // The library now shows where it is used, and refuses to delete it.
  await page.goto("/admin/media");
  await files.getByRole("button", { name: "Open Marina Terrace.jpg" }).click();
  await expect(
    panel.getByRole("link", { name: /Location Test Emirate: share image/ }),
  ).toBeVisible();
  await expect(panel.getByText("This file is in use, so it cannot be deleted.")).toBeVisible();
  await page.keyboard.press("Escape");

  // Bulk delete removes only the unused PDF.
  await files.getByRole("checkbox", { name: "Select Marina Terrace.jpg" }).check();
  await files.getByRole("checkbox", { name: "Select Brochure.pdf" }).check();
  await page
    .getByRole("region", { name: "Bulk actions" })
    .getByRole("button", { name: "Delete" })
    .click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete unused" }).click();
  await expect(page.getByText("1 file deleted")).toBeVisible();
  await expect(page.getByText(/kept because they are in use: Marina Terrace\.jpg/)).toBeVisible();
  await expect(files.getByRole("listitem").filter({ hasText: "Brochure.pdf" })).toHaveCount(0);
  await expect(photoTile).toBeVisible();
});
