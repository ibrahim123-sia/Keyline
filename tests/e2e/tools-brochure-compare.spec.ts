import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  clearListings,
  db,
  decidedCookies,
  deleteLocations,
  expectPath,
  revalidateTags,
  setSettings,
  snap,
  uniqueEmail,
} from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

type Home = { id: string; slug: string; title: string; reference: string };

/** Two homes for sale in "E2E Tools Bay": B is the better price per area. */
async function seed(request: APIRequestContext): Promise<[Home, Home]> {
  await clearListings();
  await deleteLocations(["e2e-tools-bay"]);
  await setSettings(request, "market", {
    baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
    areaUnit: "sqm",
    visitorCurrencies: [],
  });
  await setSettings(request, "leads", { brochureEmailGate: false });
  const q = async (sql: string, params: unknown[] = []) => (await db().query(sql, params)).rows;
  const suffix = Math.floor(Math.random() * 1e6);
  const [bay] = await q(
    `insert into locations (id, agency_id, level, name, slug) values (gen_random_uuid(), $1, 'city', 'E2E Tools Bay', 'e2e-tools-bay') returning id`,
    [AGENCY],
  );
  const homes: Home[] = [];
  for (const [i, [title, price, size]] of (
    [
      ["Harbour light flat", 200_000_000, 100],
      ["Palm court flat", 210_000_000, 120],
    ] as const
  ).entries()) {
    const [row] = await q(
      `insert into properties (id, agency_id, reference, title, slug, purpose, status, location_id, point, price, currency, beds, baths, size, published_at)
       values (gen_random_uuid(), $1, $2, $3, $4, 'sale', 'available', $5, ST_SetSRID(ST_MakePoint($6::float8, 25.08), 4326),
         $7, 'AED', 2, 2, $8, now() - interval '1 day')
       returning id, slug, title, reference`,
      [
        AGENCY,
        `HD-TB${i + 1}`,
        title,
        `e2e-tools-${i + 1}-${suffix}`,
        bay.id,
        55.14 + i / 100,
        price,
        size,
      ],
    );
    homes.push(row as Home);
  }
  await revalidateTags(request, ["listings", "search", "locations", "settings"]);
  return homes as [Home, Home];
}

const pageCount = (pdf: Buffer) =>
  pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;

test.describe("tools: brochure and compare (11 §3, §4)", () => {
  test("a visitor downloads the branded brochure from a property page", async ({
    page,
    request,
  }) => {
    const [home] = await seed(request);
    // The first visit compiles the page in dev mode, which can be slow on a busy machine.
    await page.goto(`/property/${home.slug}`, { timeout: 240_000 });
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.getByRole("link", { name: "Download brochure" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`${home.reference}-${home.slug}.pdf`);
    const pdf = readFileSync((await download.path())!);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(pdf)).toBe(4);
    const { rows } = await db().query(
      "select coalesce(sum(brochure_downloads), 0)::int as n from property_daily_stats where property_id = $1",
      [home.id],
    );
    expect(rows[0].n).toBe(1);

    // With the email gate on, the visitor leaves an email first and becomes a brochure lead.
    await setSettings(request, "leads", { brochureEmailGate: true });
    await page.reload();
    await page.getByRole("button", { name: "Download brochure" }).click();
    const dialog = page.getByRole("dialog", { name: "Get the brochure" });
    const email = uniqueEmail("brochure");
    await dialog.getByRole("textbox", { name: "Your name" }).fill("Rana Visitor");
    await dialog.getByRole("textbox", { name: "Email", exact: true }).fill(email);
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Send me the brochure" }).click();
    await expect(dialog.getByText(`Sent to ${email}`)).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Download now" })).toHaveAttribute(
      "href",
      new RegExp(`/api/brochure/property/${home.id}\\?t=`),
    );
    await snap(page, "brochure-gate");
    const leads = await db().query(
      "select l.source from leads l join contacts c on c.id = l.contact_id where c.email = $1",
      [email],
    );
    expect(leads.rows).toEqual([{ source: "brochure" }]);
    await setSettings(request, "leads", { brochureEmailGate: false });
  });

  test("a guest compares two homes from the tray, sees the best value and shares the table", async ({
    page,
    request,
    browser,
  }) => {
    const [a, b] = await seed(request);
    for (const home of [a, b]) {
      await page.goto(`/property/${home.slug}`);
      await page.getByRole("button", { name: `Add to compare: ${home.title}` }).click();
      await expect(
        page.getByRole("button", { name: `Remove from compare: ${home.title}` }),
      ).toHaveAttribute("aria-pressed", "true");
    }
    await page.getByRole("link", { name: "Compare (2)" }).click();
    await expectPath(page, "/tools/compare");
    await expect(page.getByRole("heading", { name: "Compare homes", level: 1 })).toBeVisible();

    const table = page.getByRole("table");
    await expect(table.getByRole("link", { name: a.title })).toBeVisible();
    await expect(table.getByRole("link", { name: b.title })).toBeVisible();
    // B costs less per m² (17,500 against 20,000): only its cell is highlighted.
    const perArea = table.locator('tr[data-row="pricePerArea"] td');
    await expect(perArea.nth(0)).not.toHaveAttribute("data-best", /.*/);
    await expect(perArea.nth(1)).toHaveAttribute("data-best", "true");
    await expect(perArea.nth(1)).toContainText("AED 17,500");
    await expect(perArea.nth(1)).toContainText("Best value");
    await snap(page, "compare-table");

    const link = await page.getByRole("textbox", { name: "Link to this comparison" }).inputValue();
    expect(link).toContain(`/tools/compare?ids=${a.id},${b.id}`);

    // Anyone with the link sees the same table.
    const other = await browser.newContext({ storageState: decidedCookies });
    const stranger = await other.newPage();
    await stranger.goto(new URL(link).pathname + new URL(link).search);
    await expect(stranger.getByText("A comparison someone shared with you.")).toBeVisible();
    await expect(stranger.getByRole("table").getByRole("link", { name: a.title })).toBeVisible();
    await expect(stranger.getByRole("table").getByRole("link", { name: b.title })).toBeVisible();
    await other.close();

    // Removing a home from their own table.
    await page.getByRole("button", { name: `Remove from compare: ${a.title}` }).click();
    await expect(page.getByRole("table").getByRole("link", { name: a.title })).toBeHidden();
  });

  test("the compare table scrolls sideways on a phone @phone", async ({ page, request }) => {
    const [a, b] = await seed(request);
    await page.goto(`/tools/compare?ids=${a.id},${b.id}`);
    await expect(page.getByRole("table").getByRole("link", { name: b.title })).toBeAttached();
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(fits).toBe(true); // the page itself never scrolls sideways; the table does
    await snap(page, "compare-phone");
  });
});
