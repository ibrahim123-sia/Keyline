import { expect, test } from "@playwright/test";
import { clearListings, db, revalidateTags, setSettings } from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

test("public projects: list, filter, prices in the visitor's currency, project page", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await clearListings();
  await db().query("delete from developers where slug in ('e2e-northline', 'e2e-calder')");
  await db().query("delete from locations where slug in ('e2e-creek', 'e2e-hills')");
  const q = async (sql: string, params: unknown[] = []) => (await db().query(sql, params)).rows;
  const [creek] = await q(
    `insert into locations (id, agency_id, level, name, slug) values (gen_random_uuid(), $1, 'area', 'E2E Creek', 'e2e-creek') returning id`,
    [AGENCY],
  );
  const [hills] = await q(
    `insert into locations (id, agency_id, level, name, slug) values (gen_random_uuid(), $1, 'area', 'E2E Hills', 'e2e-hills') returning id`,
    [AGENCY],
  );
  const [north] = await q(
    `insert into developers (id, agency_id, name, slug, description) values (gen_random_uuid(), $1, 'E2E Northline', 'e2e-northline', 'Waterfront specialists.') returning id`,
    [AGENCY],
  );
  const [calder] = await q(
    `insert into developers (id, agency_id, name, slug) values (gen_random_uuid(), $1, 'E2E Calder', 'e2e-calder') returning id`,
    [AGENCY],
  );
  const [plan] = await q(
    `insert into payment_plans (id, agency_id, name) values (gen_random_uuid(), $1, 'E2E 60/40') returning id`,
    [AGENCY],
  );
  for (const [i, [stage, label, pct]] of [
    ["booking", "Down payment", 20],
    ["construction", "During construction", 40],
    ["handover", "On handover", 40],
  ].entries())
    await q(
      `insert into payment_plan_steps (id, agency_id, payment_plan_id, sort_order, stage, label, percent)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
      [AGENCY, plan.id, i, stage, label, pct],
    );
  const [lindenRow] = await q(
    `insert into projects (id, agency_id, name, slug, developer_id, location_id, point, status, handover_date,
       starting_price, currency, payment_plan_id, construction_progress, is_published, published_at, highlights, description_html)
     values (gen_random_uuid(), $1, 'The E2E Linden', 'the-e2e-linden', $2, $3, ST_SetSRID(ST_MakePoint(55.346, 25.201), 4326),
       'under_construction', '2027-12-31', 145000000, 'AED', $4, 35, true, now(), array['Marina views'], '<p>Waterfront homes by the creek.</p>')
     returning id`,
    [AGENCY, north.id, creek.id, plan.id],
  );
  await q(
    `insert into project_unit_types (id, agency_id, project_id, name, beds, size_min, size_max, price_from, available_count, sort_order)
     values (gen_random_uuid(), $1, $2, 'E2E 1 bed', 1, 60, 75, 145000000, 12, 0)`,
    [AGENCY, lindenRow.id],
  );
  await q(
    `insert into projects (id, agency_id, name, slug, developer_id, location_id, status, handover_text, is_published, published_at)
     values (gen_random_uuid(), $1, 'E2E Palmera', 'e2e-palmera', $2, $3, 'announced', 'Q2 2028', true, now())`,
    [AGENCY, calder.id, hills.id],
  );
  await q(
    `insert into projects (id, agency_id, name, slug, location_id, is_published) values (gen_random_uuid(), $1, 'E2E Hidden', 'e2e-hidden', $2, false)`,
    [AGENCY, creek.id],
  );
  await setSettings(request, "market", {
    baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
    visitorCurrencies: [
      {
        code: "USD",
        symbol: "$",
        symbolPosition: "before",
        decimals: 2,
        rate: 0.2723,
        isExample: true,
      },
    ],
    areaUnit: "sqm",
  });
  await setSettings(request, "contact", {
    whatsapp: "+971501234567",
    phone: "+97141234567",
    email: "hello@agency.example",
  });
  await revalidateTags(request, ["projects", "developers", "locations", "listings"]);

  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Off-plan projects", level: 1 })).toBeVisible();
  const linden = page.getByRole("article").filter({ hasText: "The E2E Linden" });
  await expect(linden).toContainText("from");
  await expect(linden).toContainText("AED 1,450,000");
  await expect(linden).toContainText("60/40");
  await expect(page.getByRole("article").filter({ hasText: "E2E Hidden" })).toHaveCount(0);

  // Filters live in the URL.
  await page.getByRole("combobox", { name: "Developer" }).selectOption("e2e-calder");
  await page.getByRole("button", { name: "Show projects" }).click();
  await expect(page).toHaveURL(/developer=e2e-calder/);
  await expect(page.getByRole("status")).toHaveText("1 project");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("link", { name: "Clear" }).click();
  await expect(page.getByRole("status")).toContainText("projects");

  // The visitor's currency: converted prices are marked "≈".
  await page.getByRole("banner").getByRole("button", { name: "Currency: AED" }).click();
  await page.getByRole("menuitemradio", { name: "USD · example rate" }).click();
  await expect(linden).toContainText("≈ $395,000");

  await linden.getByRole("link", { name: "The E2E Linden" }).click();
  await expect(page).toHaveURL(/\/projects\/the-e2e-linden$/);
  await expect(page.getByRole("heading", { name: "The E2E Linden", level: 1 })).toBeVisible();
  await expect(page.getByText("Waterfront homes by the creek.")).toBeVisible();
  const units = page.getByRole("table");
  await expect(units.getByRole("rowheader", { name: /E2E 1 bed/ })).toContainText("12 available");
  await expect(units).toContainText("60–75 m²");
  await expect(page.getByRole("region", { name: "Payment plan" })).toContainText("40%");
  const contact = page.getByRole("region", { name: "Interested?" });
  await expect(contact.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/971501234567\?text=/,
  );
  await expect(contact.getByRole("link", { name: "Email" })).toHaveAttribute(
    "href",
    /^mailto:hello@agency\.example/,
  );
  await expect(
    page.getByRole("link", { name: "See all projects by E2E Northline" }),
  ).toHaveAttribute("href", "/developers/e2e-northline");

  // Not published: the helpful 404.
  const res = await page.goto("/projects/e2e-hidden");
  expect(res?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "We couldn't find that page", level: 1 }),
  ).toBeVisible();
});
