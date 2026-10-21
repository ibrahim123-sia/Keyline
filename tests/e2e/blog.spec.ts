import { expect, test } from "@playwright/test";
import {
  INTERNAL_SECRET,
  db,
  expectNotFoundPage,
  revalidateTags,
  signInAsAdmin,
  snap,
} from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

test("blog: write a post with a quote and a listing card, publish, schedule, rename", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await db().query("delete from posts where slug like 'e2e-%'");
  await db().query("delete from post_categories where slug = 'e2e-guides'");
  await db().query("delete from post_tags where slug = 'e2e-fees'");
  await db().query("delete from seo_redirects where from_path like '/insights/e2e-%'");
  await db().query("delete from properties where reference = 'E2E-B1'");
  await db().query(
    `insert into post_categories (id, agency_id, name, slug, sort_order) values (gen_random_uuid(), $1, 'E2E Guides', 'e2e-guides', 0)`,
    [AGENCY],
  );
  await db().query(
    `insert into properties (id, agency_id, reference, title, slug, purpose, status, published_at, price, currency)
     values (gen_random_uuid(), $1, 'E2E-B1', 'E2E Blog home', 'e2e-blog-home', 'sale', 'available', now(), 150000000, 'AED')`,
    [AGENCY],
  );
  await revalidateTags(request, ["posts", "listings"]);
  await signInAsAdmin(page, request);

  // New post: a title, then the draft opens in the editor.
  await page.goto("/admin/website/blog");
  await expect(page.getByRole("heading", { name: "Blog", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "New post" }).click();
  const dialog = page.getByRole("dialog", { name: "New post" });
  await dialog.getByRole("textbox", { name: "Title" }).fill("E2E Service charges explained");
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/website\/blog\/[0-9a-f-]{36}$/);
  const panel = page.getByRole("complementary", { name: "Publishing" });
  await expect(panel.getByRole("region", { name: "Before publishing" })).toContainText(
    "Write the post",
  );

  // The text: a paragraph, a quote and a listing card.
  await page.getByRole("textbox", { name: "Excerpt" }).fill("Where the yearly fees go.");
  const text = page.getByRole("textbox", { name: "Text", exact: true });
  await text.click();
  await page.keyboard.type("Service charges pay for the shared parts of a building.");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Quote", exact: true }).click();
  await page.keyboard.type("Ask for the last three years of accounts.");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Insert a listing card" }).click();
  const picker = page.getByRole("dialog");
  await picker.getByRole("textbox", { name: "Find a listing" }).fill("E2E-B1");
  await picker.getByRole("button", { name: /E2E-B1 · E2E Blog home/ }).click();
  await expect(text.locator("[data-property-card]")).toContainText("E2E-B1 · E2E Blog home");

  await page.getByRole("combobox", { name: "Category" }).click();
  await page.getByRole("option", { name: "E2E Guides" }).click();
  const tags = page.getByRole("combobox", { name: "Tags" });
  await tags.fill("E2E fees");
  await tags.press("Enter");

  await expect(panel.getByRole("status")).toHaveText(/All changes saved at/, { timeout: 30_000 });
  await expect(panel.getByRole("region", { name: "Before publishing" })).toBeHidden();
  await snap(page, "post-editor");
  await panel.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText("E2E Service charges explained is published")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Unpublish" })).toBeVisible();

  // On the site: the list, the category page and the post.
  await page.goto("/insights");
  await expect(page.getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();
  await page.goto("/insights/category/e2e-guides");
  await expect(page.getByRole("heading", { name: "E2E Guides", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "E2E Service charges explained" }).click();
  await expect(page).toHaveURL(/\/insights\/e2e-service-charges-explained$/);
  await expect(
    page.getByRole("heading", { name: "E2E Service charges explained", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("By Admin E2E")).toBeVisible();
  await expect(page.getByText("1 min read", { exact: true })).toBeVisible();
  await expect(page.locator("blockquote")).toHaveText("Ask for the last three years of accounts.");
  await expect(page.getByRole("link", { name: "E2E Blog home" }).first()).toHaveAttribute(
    "href",
    "/property/e2e-blog-home",
  );
  await expect(page.getByRole("link", { name: "E2E fees" })).toHaveAttribute(
    "href",
    "/insights?tag=e2e-fees",
  );
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  const article = ld.map((s) => JSON.parse(s)).find((d) => d["@type"] === "Article");
  expect(article).toMatchObject({
    headline: "E2E Service charges explained",
    articleSection: "E2E Guides",
    author: { "@type": "Person", name: "Admin E2E" },
  });
  await snap(page, "post-page");

  // A changed slug keeps the old address working (301).
  const { rows: created } = await db().query(
    "select id from posts where slug = 'e2e-service-charges-explained'",
  );
  await page.goto(`/admin/website/blog/${created[0].id}`);
  const slug = page.getByRole("textbox", { name: "URL slug" });
  await slug.fill("e2e-service-charges");
  await page.getByRole("button", { name: "Save now" }).click();
  await expect(panel.getByRole("status")).toHaveText(/All changes saved at/, { timeout: 30_000 });
  await expect
    .poll(
      async () =>
        (
          await db().query(
            "select to_path from seo_redirects where from_path = '/insights/e2e-service-charges-explained'",
          )
        ).rows,
    )
    .toEqual([{ to_path: "/insights/e2e-service-charges" }]);
  await page.goto("/insights/e2e-service-charges-explained");
  await expect(page).toHaveURL(/\/insights\/e2e-service-charges$/);

  // Scheduled: off the site until the cron finds it due.
  await page.goto("/admin/website/blog");
  await page.getByRole("button", { name: "New post" }).click();
  await dialog.getByRole("textbox", { name: "Title" }).fill("E2E Moving in checklist");
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/website\/blog\/[0-9a-f-]{36}$/);
  await page.getByRole("textbox", { name: "Text", exact: true }).click();
  await page.keyboard.type("Read the meters on the first day.");
  await panel.getByLabel("Or schedule it").fill("2099-01-01T09:00");
  await panel.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByText("E2E Moving in checklist is scheduled")).toBeVisible();
  await expect(panel).toContainText("Goes on the site");
  await expectNotFoundPage(page, "/insights/e2e-moving-in-checklist");
  await page.goto("/insights");
  await expect(page.getByRole("link", { name: "E2E Moving in checklist" })).toHaveCount(0);

  await db().query(
    "update posts set publish_at = now() - interval '1 minute' where slug = 'e2e-moving-in-checklist'",
  );
  const cron = await request.post("/api/internal/cron", {
    headers: { authorization: `Bearer ${INTERNAL_SECRET}` },
    data: {},
  });
  expect(cron.ok()).toBe(true);
  const { rows } = await db().query(
    "select status, published_at is not null as dated from posts where slug = 'e2e-moving-in-checklist'",
  );
  expect(rows[0]).toEqual({ status: "published", dated: true });
  await page.goto("/insights");
  await expect(page.getByRole("link", { name: "E2E Moving in checklist" })).toBeVisible();
});
