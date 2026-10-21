import { expect, test } from "@playwright/test";
import { clearListings, db, revalidateTags } from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

test("developer and agent pages: lists, profiles, their projects and listings", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await clearListings();
  await db().query("delete from developers where slug = 'e2e-saffron'");
  await db().query("delete from agents where slug in ('e2e-sara', 'e2e-former')");
  await db().query("delete from locations where slug = 'e2e-bay'");
  const q = async (sql: string, params: unknown[] = []) => (await db().query(sql, params)).rows;
  const [bay] = await q(
    `insert into locations (id, agency_id, level, name, slug) values (gen_random_uuid(), $1, 'area', 'E2E Bay', 'e2e-bay') returning id`,
    [AGENCY],
  );
  const [dev] = await q(
    `insert into developers (id, agency_id, name, slug, description, website, established_year)
     values (gen_random_uuid(), $1, 'E2E Saffron', 'e2e-saffron', 'Homes by the bay since 2001.', 'https://saffron.example', 2001) returning id`,
    [AGENCY],
  );
  const [project] = await q(
    `insert into projects (id, agency_id, name, slug, developer_id, location_id, status, is_published, published_at)
     values (gen_random_uuid(), $1, 'E2E Bay Crest', 'e2e-bay-crest', $2, $3, 'under_construction', true, now()) returning id`,
    [AGENCY, dev.id, bay.id],
  );
  const [sara] = await q(
    `insert into agents (id, agency_id, name, slug, title, languages, areas, whatsapp, phone, email, bio, sort_order, is_active)
     values (gen_random_uuid(), $1, 'E2E Sara Khan', 'e2e-sara', 'Senior consultant', array['English', 'Urdu'], array[$2]::uuid[],
       '+971509998877', '+97141110000', 'sara@agency.example', 'Ten years in the bay area.', 0, true) returning id`,
    [AGENCY, bay.id],
  );
  await q(
    `insert into agents (id, agency_id, name, slug, is_active) values (gen_random_uuid(), $1, 'E2E Former', 'e2e-former', false)`,
    [AGENCY],
  );
  await q(
    `insert into properties (id, agency_id, reference, title, slug, purpose, status, completion, project_id, agent_id, published_at, price, currency)
     values (gen_random_uuid(), $1, 'E2E-P1', 'E2E Bay Crest two bed', 'e2e-bay-crest-two-bed', 'sale', 'available', 'off_plan', $2, $3, now(), 180000000, 'AED')`,
    [AGENCY, project.id, sara.id],
  );
  await revalidateTags(request, ["developers", "projects", "agents", "listings", "locations"]);

  // Developers
  await page.goto("/developers");
  await expect(page.getByRole("heading", { name: "Developers", level: 1 })).toBeVisible();
  const tile = page.getByRole("article").filter({ hasText: "E2E Saffron" });
  await expect(tile).toContainText("1 project");
  await expect(tile).toContainText("Founded 2001");
  await tile.getByRole("link", { name: "E2E Saffron" }).click();
  await expect(page).toHaveURL(/\/developers\/e2e-saffron$/);
  await expect(page.getByRole("heading", { name: "E2E Saffron", level: 1 })).toBeVisible();
  await expect(page.getByText("Homes by the bay since 2001.")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Website/ })).toHaveAttribute(
    "href",
    "https://saffron.example",
  );
  await expect(
    page.getByRole("region", { name: "Projects" }).getByRole("link", { name: "E2E Bay Crest" }),
  ).toHaveAttribute("href", "/projects/e2e-bay-crest");
  await expect(
    page.getByRole("region", { name: "Homes for sale" }).getByRole("link", {
      name: "E2E Bay Crest two bed",
    }),
  ).toBeVisible();

  // Agents
  await page.goto("/agents");
  await expect(page.getByRole("heading", { name: "Our team", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E Former" })).toHaveCount(0);
  await page.getByRole("link", { name: "E2E Sara Khan" }).click();
  await expect(page).toHaveURL(/\/agents\/e2e-sara$/);
  await expect(page.getByRole("heading", { name: "E2E Sara Khan", level: 1 })).toBeVisible();
  await expect(page.getByText("English, Urdu")).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E Bay", exact: true })).toHaveAttribute(
    "href",
    "/buy/e2e-bay",
  );
  const contact = page.getByRole("region", { name: "Contact E2E" });
  await expect(contact.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/971509998877\?text=/,
  );
  await expect(contact.getByRole("link", { name: "Call" })).toHaveAttribute(
    "href",
    "tel:+97141110000",
  );
  await expect(page.getByRole("link", { name: "E2E Bay Crest two bed" })).toBeVisible();

  // A profile that is turned off is not public.
  const res = await page.goto("/agents/e2e-former");
  expect(res?.status()).toBe(404);
});
