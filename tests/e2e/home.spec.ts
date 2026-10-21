import { expect, test } from "@playwright/test";
import { clearListings, db, deleteLocations, revalidateTags } from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

test("home page renders its sections and the hero search builds the search URL", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  await clearListings();
  await db().query("delete from pages");
  await db().query("delete from property_types where slug = 'e2e-home-villas'");
  await deleteLocations(["e2e-home-area"]);
  const q = async (sql: string, params: unknown[] = []) => (await db().query(sql, params)).rows;
  const [type] = await q(
    `insert into property_types (id, agency_id, name, slug) values (gen_random_uuid(), $1, 'E2E Home Villa', 'e2e-home-villas') returning id`,
    [AGENCY],
  );
  const [area] = await q(
    `insert into locations (id, agency_id, level, name, slug, is_featured) values (gen_random_uuid(), $1, 'area', 'E2E Home Area', 'e2e-home-area', true) returning id`,
    [AGENCY],
  );
  await q(
    `insert into properties (id, agency_id, reference, title, slug, purpose, status, property_type_id, location_id,
       price, currency, beds, baths, size, published_at, is_featured)
     values (gen_random_uuid(), $1, 'E2E-H1', 'E2E featured villa', 'e2e-featured-villa', 'sale', 'available', $2, $3,
       350000000, 'AED', 4, 4, 320, now() - interval '1 day', true)`,
    [AGENCY, type.id, area.id],
  );
  const sections = [
    {
      id: "hero",
      type: "hero_search",
      props: {
        heading: "E2E home heading",
        subheading: "Homes checked in person.",
        tabs: ["buy", "rent"],
      },
      style: { background: "sand" },
    },
    {
      id: "promise",
      type: "promise_strip",
      props: {
        items: [
          { title: "Verified in person", text: "We visit every home.", icon: "verified" },
          { title: "Real travel times", text: "Measured for each home.", icon: "pin" },
        ],
      },
    },
    {
      id: "featured",
      type: "featured_listings",
      props: { heading: "Featured homes", source: "featured", count: 3 },
    },
    { id: "areas", type: "areas_grid", props: { heading: "Areas", source: "featured", count: 4 } },
    { id: "broken", type: "marquee", props: {} },
  ];
  await q(
    `insert into pages (id, agency_id, title, slug, status, is_home, sections) values (gen_random_uuid(), $1, 'Home', 'home', 'published', true, $2::jsonb)`,
    [AGENCY, JSON.stringify(sections)],
  );
  // The home page and listing caches are tagged; ask the app to forget them.
  await revalidateTags(request, ["page:home", "pages", "listings", "search", "locations"]);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "E2E home heading", level: 1 })).toBeVisible();
  await expect(page.getByText("Verified in person")).toBeVisible();
  const featured = page.getByRole("region", { name: "Featured homes" });
  await expect(featured.getByRole("link", { name: "E2E featured villa" })).toBeVisible();
  await expect(featured).toContainText("AED 3,500,000");
  const areas = page.getByRole("region", { name: "Areas" });
  await expect(areas.getByRole("link", { name: "E2E Home Area" })).toBeVisible();
  await expect(areas).toContainText("1 for sale");

  // The search card: Rent tab, a type, then Search goes to the canonical search URL.
  const search = page.getByRole("search", { name: "Search" });
  await search.getByRole("tab", { name: "Rent" }).click();
  await search.getByRole("combobox", { name: "Type" }).selectOption("e2e-home-villas");
  await search.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/rent\?type=e2e-home-villas$/);
});
