import { expect, test, type Page } from "@playwright/test";
import {
  clearListings,
  db,
  deleteLocations,
  revalidateTags,
  setSettings,
  signInAsAdmin,
  snap,
} from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";
const noBar = {
  enabled: false,
  text: "",
  linkLabel: "",
  href: "",
  startsAt: null,
  endsAt: null,
};

async function cleanUp() {
  await db().query("delete from menus");
  await db().query("delete from seo_redirects where from_path like '/e2e-%'");
  await db().query("delete from not_found_log where path like '/e2e-%'");
}

/** The open side panel's form field by its label. */
const inPanel = (page: Page, title: string) => page.getByRole("dialog", { name: title });

test.describe("SEO and navigation", () => {
  test.beforeEach(cleanUp);
  test.afterAll(cleanUp);

  test("admin builds the header menu with a dropdown; the site shows it", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    await revalidateTags(request, ["menus"]);
    await signInAsAdmin(page, request);
    await page.goto("/admin/website/menus");
    await expect(page.getByRole("heading", { name: "Menus", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Add link" }).click();
    let panel = inPanel(page, "New link");
    await panel.getByRole("textbox", { name: "Label", exact: true }).fill("E2E Buy");
    await panel.getByRole("combobox", { name: "Links to" }).click();
    await page.getByRole("option", { name: "Search preset" }).click();
    await panel.getByRole("textbox", { name: "Search address", exact: true }).fill("/buy");
    await panel.getByRole("button", { name: "Add" }).click();
    await expect(panel).toBeHidden();

    await page.getByRole("button", { name: "Add a dropdown link under E2E Buy" }).click();
    panel = inPanel(page, "New dropdown link");
    await panel.getByRole("textbox", { name: "Label", exact: true }).fill("E2E Agents");
    await panel.getByRole("combobox", { name: "Links to" }).click();
    await page.getByRole("option", { name: "Web address" }).click();
    await panel.getByRole("textbox", { name: "Address", exact: true }).fill("/agents");
    await panel.getByRole("button", { name: "Add" }).click();
    await expect(panel).toBeHidden();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Header menu saved")).toBeVisible();
    await snap(page, "p5-menus-admin");

    await page.goto("/");
    const nav = page.getByRole("banner").getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "E2E Buy" })).toHaveAttribute("href", "/buy");
    await nav.getByRole("button", { name: "E2E Buy: more links" }).click();
    await expect(nav.getByRole("link", { name: "E2E Agents" })).toHaveAttribute("href", "/agents");
    await page.keyboard.press("Escape");
    await expect(nav.getByRole("link", { name: "E2E Agents" })).toBeHidden();
    await snap(page, "p5-menus-site");
  });

  test("footer columns and the announcement bar come from Website -> Menus", async ({
    page,
    request,
  }) => {
    await db().query(
      `insert into menus (id, agency_id, location, title, items) values (gen_random_uuid(), $1, 'footer_1', 'E2E Explore', $2::jsonb)`,
      [
        AGENCY,
        JSON.stringify([
          {
            id: "f1",
            label: "E2E Rentals",
            type: "search",
            target: "/rent",
            openInNewTab: false,
            children: [],
          },
        ]),
      ],
    );
    await revalidateTags(request, ["menus"]);
    await setSettings(request, "website", {
      footer: { text: "E2E homes by the sea.", legalText: "E2E regulated agency." },
      announcement: {
        ...noBar,
        enabled: true,
        text: "E2E open house on Saturday",
        linkLabel: "See homes",
        href: "/buy",
      },
    });
    try {
      await page.goto("/sign-in");
      const bar = page.getByRole("region", { name: "Announcement" });
      await expect(bar).toContainText("E2E open house on Saturday");
      await expect(bar.getByRole("link", { name: "See homes" })).toHaveAttribute("href", "/buy");
      const footer = page.getByRole("contentinfo");
      await expect(footer.getByText("E2E homes by the sea.")).toBeVisible();
      await expect(footer.getByText("E2E regulated agency.")).toBeVisible();
      await expect(
        footer
          .getByRole("navigation", { name: "E2E Explore" })
          .getByRole("link", { name: "E2E Rentals" }),
      ).toHaveAttribute("href", "/rent");
    } finally {
      await setSettings(request, "website", {
        footer: { text: "", legalText: "" },
        announcement: noBar,
      });
    }
  });

  test("a missing address shows in the 404 monitor and one click redirects it", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const res = await page.goto("/e2e-old-site/listing.php");
    expect(res?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "We couldn't find that page", level: 1 }),
    ).toBeVisible();

    await signInAsAdmin(page, request);
    // The visit is counted after the response: wait for it to land.
    await expect
      .poll(async () => {
        const { rows } = await db().query(
          "select hits from not_found_log where path = '/e2e-old-site/listing.php'",
        );
        return rows[0]?.hits ?? 0;
      })
      .toBeGreaterThan(0);
    // The whole suite's 404s share the list: search for this one.
    await page.goto("/admin/website/seo/not-found?q=e2e-old-site");
    const row = page.getByRole("row").filter({ hasText: "/e2e-old-site/listing.php" });
    await row.getByRole("button", { name: "Create redirect" }).click();
    const panel = inPanel(page, "New redirect");
    await expect(panel.getByRole("textbox", { name: "Old address", exact: true })).toHaveValue(
      "/e2e-old-site/listing.php",
    );
    await panel.getByRole("textbox", { name: "New address", exact: true }).fill("/rent");
    await panel.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Redirect saved")).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: "/e2e-old-site/listing.php" }),
    ).toHaveCount(0);

    // The middleware serves redirects with a real 301; it picks up new rules within seconds.
    await expect
      .poll(
        async () => (await request.get("/e2e-old-site/listing.php", { maxRedirects: 0 })).status(),
        { timeout: 30_000 },
      )
      .toBe(301);
    await page.goto("/e2e-old-site/listing.php");
    await expect(page).toHaveURL(/\/rent$/);
    await expect
      .poll(async () => {
        const { rows } = await db().query(
          "select hits from seo_redirects where from_path = '/e2e-old-site/listing.php'",
        );
        return rows[0]?.hits ?? 0;
      })
      .toBeGreaterThanOrEqual(1);
    await page.goto("/admin/website/seo");
    await expect(
      page.getByRole("row").filter({ hasText: "/e2e-old-site/listing.php" }),
    ).toContainText("/rent");
    await snap(page, "p5-redirects");
  });

  test("robots.txt, the sitemap index and listing structured data", async ({ page, request }) => {
    await clearListings();
    await deleteLocations(["e2e-seo-area"]);
    await db().query("delete from property_types where slug = 'e2e-seo-apartments'");
    const q = async (sql: string, params: unknown[] = []) => (await db().query(sql, params)).rows;
    const [type] = await q(
      `insert into property_types (id, agency_id, name, slug) values (gen_random_uuid(), $1, 'E2E Apartment', 'e2e-seo-apartments') returning id`,
      [AGENCY],
    );
    const [area] = await q(
      `insert into locations (id, agency_id, level, name, slug) values (gen_random_uuid(), $1, 'area', 'E2E SEO Area', 'e2e-seo-area') returning id`,
      [AGENCY],
    );
    await q(
      `insert into properties (id, agency_id, reference, title, slug, purpose, status, property_type_id, location_id,
         price, currency, beds, baths, size, description_html, published_at)
       values (gen_random_uuid(), $1, 'E2E-SEO1', 'E2E sea view flat', 'e2e-seo-flat', 'sale', 'available', $2, $3,
         230000000, 'AED', 2, 2, 111.5, '<p>Bright flat by the water.</p>', now() - interval '2 days')`,
      [AGENCY, type.id, area.id],
    );
    await revalidateTags(request, ["listings", "search", "sitemap", "locations"]);

    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /admin/");
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);

    const index = await request.get("/sitemap.xml");
    expect(index.headers()["content-type"]).toContain("xml");
    expect(await index.text()).toContain("/sitemaps/properties.xml");
    expect(await (await request.get("/sitemaps/properties.xml")).text()).toContain(
      "/property/e2e-seo-flat",
    );
    expect((await request.get("/sitemaps/nothing.xml")).status()).toBe(404);

    await page.goto("/property/e2e-seo-flat");
    await expect(page.getByRole("heading", { name: "E2E sea view flat", level: 1 })).toBeVisible();
    const blocks = (await page.locator('script[type="application/ld+json"]').allTextContents()).map(
      (t) => JSON.parse(t) as { "@graph"?: Array<Record<string, unknown>>; "@type"?: string },
    );
    const nodes = blocks.flatMap((b) => b["@graph"] ?? [b]);
    const types = nodes.map((n) => n["@type"]).flat();
    expect(types).toEqual(
      expect.arrayContaining([
        "RealEstateAgent",
        "WebSite",
        "RealEstateListing",
        "Product",
        "BreadcrumbList",
      ]),
    );
    const home = nodes.find((n) => [n["@type"]].flat().includes("Product"));
    expect(home?.offers).toMatchObject({ price: 2_300_000, priceCurrency: "AED" });
    await expect(page).toHaveTitle(/2 bed E2E Apartment for sale in E2E SEO Area/);
  });
});
