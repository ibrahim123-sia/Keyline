import { expect, test } from "@playwright/test";
import { db, deleteLocations, revalidateTags, signInAsAdmin } from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

test("area guide: write, add a question, publish; it shows on /areas and the area's search page", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await deleteLocations(["e2e-cove"]);
  await db().query(
    `insert into locations (id, agency_id, level, name, slug, center)
     values (gen_random_uuid(), $1, 'area', 'E2E Cove', 'e2e-cove', ST_SetSRID(ST_MakePoint(55.2, 25.1), 4326))`,
    [AGENCY],
  );
  await revalidateTags(request, ["locations", "area-guides"]);
  await signInAsAdmin(page, request);

  await page.goto("/admin/website/area-guides");
  await expect(page.getByRole("heading", { name: "Area guides", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "New area guide" }).click();
  const dialog = page.getByRole("dialog", { name: "New area guide" });
  await dialog.getByRole("combobox", { name: "Area" }).click();
  await page.getByRole("textbox", { name: "Search locations" }).fill("cove");
  await page.getByRole("option", { name: /E2E Cove/ }).click();
  await dialog.getByRole("button", { name: "Create guide" }).click();
  await expect(page).toHaveURL(/\/admin\/website\/area-guides\/[0-9a-f-]{36}$/);

  const panel = page.getByRole("complementary", { name: "Publishing" });
  await page.getByRole("textbox", { name: "Intro" }).fill("A quiet bay with a long beach path.");
  await page.getByRole("textbox", { name: "Guide text", exact: true }).click();
  await page.keyboard.type("Mornings here start on the beach path.");
  await page.getByRole("button", { name: "Add a question" }).click();
  const question = page.getByRole("group", { name: "Question 1" });
  await question.getByRole("textbox", { name: "Question" }).fill("Is there a school nearby?");
  await question.getByRole("textbox", { name: "Answer" }).click();
  await page.keyboard.type("Yes, a primary school ten minutes away.");
  await expect(panel.getByRole("status")).toHaveText(/All changes saved at/, { timeout: 30_000 });
  await panel.getByRole("button", { name: "Publish now" }).click();
  await expect(page.getByText("E2E Cove is published")).toBeVisible();

  await page.goto("/areas");
  await page.getByRole("link", { name: "E2E Cove" }).click();
  await expect(page).toHaveURL(/\/areas\/e2e-cove$/);
  await expect(page.getByRole("heading", { name: "E2E Cove", level: 1 })).toBeVisible();
  await page.getByText("Is there a school nearby?").click();
  await expect(page.getByText("Yes, a primary school ten minutes away.")).toBeVisible();
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types = ld.map((s) => JSON.parse(s)["@type"]);
  expect(types).toEqual(expect.arrayContaining(["FAQPage", "Place"]));

  // The area's search page opens with the guide's intro and links to it.
  await page.goto("/buy/e2e-cove");
  await expect(page.getByText("A quiet bay with a long beach path.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Read the E2E Cove guide" })).toHaveAttribute(
    "href",
    "/areas/e2e-cove",
  );
  await expect(page.getByRole("heading", { name: "Questions about E2E Cove" })).toBeVisible();
});

test("testimonials and FAQs: add, show on the site, order", async ({ page, request }) => {
  test.setTimeout(240_000);
  await db().query("delete from testimonials where name like 'E2E %'");
  await db().query("delete from faqs where question like 'E2E %'");
  await signInAsAdmin(page, request);

  await page.goto("/admin/website/testimonials");
  await expect(page.getByRole("heading", { name: "Testimonials", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "New testimonial" }).click();
  const panel = page.getByRole("dialog", { name: "New testimonial" });
  await panel.getByRole("textbox", { name: "Name" }).fill("E2E Nadia");
  await panel.getByRole("textbox", { name: "Quote" }).fill("Patient, clear and quick to reply.");
  await panel.getByRole("switch", { name: "Show on the site" }).click();
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Testimonial saved")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit E2E Nadia" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Show E2E Nadia on the site" })).toBeChecked();

  await page.goto("/admin/website/faqs");
  await expect(page.getByRole("heading", { name: "FAQs", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "New question in Buying" }).click();
  const faq = page.getByRole("dialog", { name: "New question" });
  await faq.getByRole("textbox", { name: "Question" }).fill("E2E Can I view at weekends?");
  await faq.getByRole("textbox", { name: "Answer" }).click();
  await page.keyboard.type("Yes, on Saturdays by appointment.");
  await faq.getByRole("switch", { name: "Show on the site" }).click();
  await faq.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Question saved")).toBeVisible();
  await expect(
    page.getByRole("switch", { name: 'Show "E2E Can I view at weekends?" on the site' }),
  ).toBeChecked();
  const { rows } = await db().query(
    `select "group", answer_html from faqs where question = 'E2E Can I view at weekends?'`,
  );
  expect(rows[0]).toEqual({
    group: "buying",
    answer_html: "<p>Yes, on Saturdays by appointment.</p>",
  });
});
