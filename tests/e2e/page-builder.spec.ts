import { expect, test } from "@playwright/test";
import { db, expectNotFoundPage, revalidateTags, signInAsAdmin } from "./helpers";

/**
 * Phase 5 (15): an admin builds a page from sections, publishes it and changes its address;
 * the old address redirects permanently (08 §1, §6).
 */
test("page builder: build a page from sections, publish it, move it with a redirect", async ({
  page,
  request,
}) => {
  test.setTimeout(360_000);
  await db().query("delete from pages where slug like 'e2e-%'");
  await db().query("delete from seo_redirects where from_path like '/e2e-%'");
  await revalidateTags(request, ["pages", "redirects"]);
  await signInAsAdmin(page, request);

  // New page from the blank starter; it opens in the page builder.
  await page.goto("/admin/website/pages");
  await expect(page.getByRole("heading", { name: "Pages", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "New page" }).click();
  const create = page.getByRole("dialog", { name: "New page" });
  await create.getByRole("textbox", { name: "Title" }).fill("E2E Spring offer");
  await create.getByText("Blank", { exact: true }).click();
  await create.getByRole("button", { name: "Create page" }).click();
  await expect(page).toHaveURL(/\/admin\/website\/pages\/[0-9a-f-]{36}$/, { timeout: 60_000 });

  // Two sections from the picker; each one's settings open on the right.
  const settings = page.getByRole("complementary", { name: "Section settings" });
  await page.getByRole("button", { name: "Add section" }).click();
  await page
    .getByRole("dialog", { name: "Add a section" })
    .getByRole("button", { name: /^Hero Heading/ })
    .click();
  await settings.getByRole("textbox", { name: "Heading" }).fill("Spring offer: two weeks only");
  await page.getByRole("button", { name: "Add section" }).click();
  await page
    .getByRole("dialog", { name: "Add a section" })
    .getByRole("button", { name: /^Call to action/ })
    .click();
  await settings.getByRole("textbox", { name: "Heading" }).fill("Book a viewing this weekend");
  await expect(page.getByRole("status").filter({ hasText: /Draft saved/ })).toBeVisible({
    timeout: 30_000,
  });

  // The live preview renders the draft on the server.
  const preview = page.frameLocator('iframe[title="Page preview"]');
  await expect(
    preview.getByRole("heading", { name: "Spring offer: two weeks only", level: 1 }),
  ).toBeVisible({ timeout: 120_000 });
  await expect(preview.getByRole("heading", { name: "Book a viewing this weekend" })).toBeVisible();

  // Not on the site until it is published.
  await expectNotFoundPage(await page.context().newPage(), "/e2e-spring-offer");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("The page is live")).toBeVisible({ timeout: 30_000 });

  const site = await page.context().newPage();
  const res = await site.goto("/e2e-spring-offer");
  expect(res?.status()).toBe(200);
  await expect(
    site.getByRole("heading", { name: "Spring offer: two weeks only", level: 1 }),
  ).toBeVisible();
  await expect(site.getByRole("heading", { name: "Book a viewing this weekend" })).toBeVisible();

  // Draft changes stay off the site until "Publish changes".
  await page
    .getByRole("complementary", { name: "Sections" })
    .getByRole("button", { name: /^Hero/ })
    .click();
  await settings.getByRole("textbox", { name: "Heading" }).fill("Spring offer: last days");
  await expect(page.getByRole("status").filter({ hasText: /Draft saved/ })).toBeVisible({
    timeout: 30_000,
  });
  await site.reload();
  await expect(
    site.getByRole("heading", { name: "Spring offer: two weeks only", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(page.getByText("Changes published")).toBeVisible({ timeout: 30_000 });
  await site.reload();
  await expect(
    site.getByRole("heading", { name: "Spring offer: last days", level: 1 }),
  ).toBeVisible();

  // Both published versions are kept.
  await page.getByRole("button", { name: "Revisions" }).click();
  await expect(page.getByRole("dialog", { name: "Revisions" }).getByRole("listitem")).toHaveCount(
    2,
  );
  await page.keyboard.press("Escape");

  // A new address: the old one answers with a permanent redirect.
  await page.getByRole("button", { name: "Settings" }).click();
  const sheet = page.getByRole("dialog", { name: "Page settings" });
  await sheet.getByRole("textbox", { name: "URL slug" }).fill("e2e-spring");
  await sheet.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(/old address now redirects/)).toBeVisible({ timeout: 30_000 });
  const moved = await request.get("/e2e-spring-offer", { maxRedirects: 0 });
  expect([301, 308]).toContain(moved.status());
  expect(moved.headers().location).toMatch(/\/e2e-spring$/);
  await site.goto("/e2e-spring-offer");
  await expect(site).toHaveURL(/\/e2e-spring$/);

  // Phone width: the page fits without sideways scrolling.
  await site.setViewportSize({ width: 390, height: 844 });
  await site.reload();
  await expect(
    site.getByRole("heading", { name: "Spring offer: last days", level: 1 }),
  ).toBeVisible();
  const overflow = await site.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // Unknown addresses get the helpful 404.
  await expectNotFoundPage(site, "/e2e-no-such-page");
});
