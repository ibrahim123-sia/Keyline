import { expect, test } from "@playwright/test";
import { db, field, signInAsAdmin, snap } from "./helpers";

test("campaign links: a tagged link with a short link and QR code that counts clicks", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  await db().query("delete from utm_links");
  await signInAsAdmin(page, request);
  await page.goto("/admin/campaigns");
  await expect(page.getByRole("heading", { name: "Campaigns", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "New link" }).click();
  const panel = page.getByRole("dialog", { name: "New campaign link" });
  await field(page, "Name").fill("Flyer, open day");
  await field(page, "Page").fill("https://evil.example/x");
  await field(page, "Source").fill("flyer");
  await field(page, "Medium").fill("qr");
  await field(page, "Campaign").fill("open-day");
  await panel.getByRole("button", { name: "Save" }).click();
  // A short link never sends people to another site.
  await expect(panel.getByText("Use a page on this site")).toBeVisible();

  await field(page, "Page").fill("/buy");
  await expect(
    panel.getByText(/\/buy\?utm_source=flyer&utm_medium=qr&utm_campaign=open-day$/),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Save" }).click();
  // Saved: the panel now edits the link and shows its short link and QR code.
  const saved = page.getByRole("dialog", { name: "Edit Flyer, open day" });
  const short = saved.getByText(/\/go\/[a-hjkmnp-z2-9]{5}$/);
  await expect(short).toBeVisible();
  await expect(saved.getByRole("img", { name: /^QR code for / })).toBeVisible();
  await expect(saved.getByRole("button", { name: "PNG" })).toBeVisible();
  await snap(page, "campaign-link");
  const shortPath = new URL((await short.textContent())!.trim()).pathname;

  // Following it lands on the page with the campaign tags and counts one click.
  await page.goto(shortPath);
  await expect(page).toHaveURL(/\/buy\?utm_source=flyer&utm_medium=qr&utm_campaign=open-day$/);
  await expect
    .poll(async () => (await db().query("select clicks from utm_links")).rows[0]?.clicks)
    .toBe(1);
});
