import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  clearListings,
  db,
  decidedCookies,
  deleteLocations,
  expectNotFoundPage,
  expectPath,
  field,
  latestEmail,
  linkFrom,
  revalidateTags,
  setSettings,
  snap,
  uniqueEmail,
} from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";
const PASSWORD = "quiet-dune-lantern-7";

type Home = { id: string; slug: string; title: string };

/** Two 2-bed homes for sale in "E2E Account Bay". */
async function seed(request: APIRequestContext): Promise<[Home, Home]> {
  await clearListings();
  await deleteLocations(["e2e-acc-bay"]);
  await setSettings(request, "market", {
    baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
    areaUnit: "sqft",
    visitorCurrencies: [],
  });
  await setSettings(request, "leads", { signupCreatesLead: "on_intent" });
  const q = async (sql: string, params: unknown[] = []) => (await db().query(sql, params)).rows;
  const suffix = Math.floor(Math.random() * 1e6);
  const [bay] = await q(
    `insert into locations (id, agency_id, level, name, slug) values (gen_random_uuid(), $1, 'city', 'E2E Account Bay', 'e2e-acc-bay') returning id`,
    [AGENCY],
  );
  const homes: Home[] = [];
  for (const [i, title] of ["Harbour light flat", "Palm court flat"].entries()) {
    const [row] = await q(
      `insert into properties (id, agency_id, reference, title, slug, purpose, status, location_id, point, price, currency, beds, baths, size, published_at)
       values (gen_random_uuid(), $1, $2, $3, $4, 'sale', 'available', $5, ST_SetSRID(ST_MakePoint($6::float8, 25.08), 4326),
         $7, 'AED', 2, 2, 100, now() - interval '1 day')
       returning id, slug, title`,
      [
        AGENCY,
        `HD-ACC${i + 1}`,
        title,
        `e2e-acc-${i + 1}-${suffix}`,
        bay.id,
        55.14 + i / 100,
        200_000_000 + i * 10_000_000,
      ],
    );
    homes.push(row as Home);
  }
  await revalidateTags(request, ["listings", "search", "locations", "settings"]);
  return homes as [Home, Home];
}

/** Fills the sign-up form on the current page, then opens the link in the verification email. */
async function signUp(page: Page, email: string, name = "Lina Haddad") {
  await field(page, "Full name").fill(name);
  await field(page, "Email").fill(email);
  await field(page, "Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("signup-check-email")).toBeVisible();
  const mail = await latestEmail(email, "auth.verify-email");
  await page.goto(linkFrom(mail.html, "/api/auth/verify-email"));
}

async function newCustomer(page: Page, email: string) {
  await page.goto("/sign-up");
  await signUp(page, email);
  await expectPath(page, "/account");
}

test.describe("customer area (12 §1, §2)", () => {
  test("a guest saves and compares a home, signs up, and comes back with both kept", async ({
    page,
    request,
  }) => {
    const [home] = await seed(request);
    const email = uniqueEmail("saver");
    await page.goto(`/property/${home.slug}`);

    // Comparing works for guests (kept by the visitor id).
    await page.getByRole("button", { name: `Add to compare: ${home.title}` }).click();
    await expect(
      page.getByRole("button", { name: `Remove from compare: ${home.title}` }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("link", { name: "Compare (1)" })).toBeVisible();

    // Saving asks a guest to sign in or up first.
    await page.getByRole("button", { name: `Save: ${home.title}` }).click();
    const prompt = page.getByRole("dialog", { name: "Save this home to your account" });
    await expect(prompt).toBeVisible();
    await snap(page, "account-save-prompt");
    await prompt.getByRole("link", { name: "Create an account" }).click();
    await expectPath(page, "/sign-up");
    await signUp(page, email);

    // Back on the same home, signed in: the save is finished and the compare pick kept.
    await expectPath(page, `/property/${home.slug}`);
    await expect(page.getByText("Saved to your account")).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Remove from saved: ${home.title}` }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("link", { name: "Compare (1)" }).click();
    await expectPath(page, "/account/compare");
    await expect(page.getByRole("main").getByRole("link", { name: home.title })).toBeVisible();

    await page.goto("/account/saved");
    await expect(page.getByRole("heading", { name: "Saved homes", level: 1 })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: home.title })).toBeVisible();
    const { rows } = await db().query(
      "select count(*)::int as n from saved_homes h join users u on u.id = h.user_id where u.email = $1",
      [email],
    );
    expect(rows[0].n).toBe(1);
  });

  test("a customer saves the search they are looking at and manages it", async ({
    page,
    request,
  }) => {
    await seed(request);
    await newCustomer(page, uniqueEmail("searcher"));

    await page.goto("/buy?beds=2");
    await page.getByRole("button", { name: "Save search" }).click();
    const dialog = page.getByRole("dialog", { name: "Save search" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("Two beds by the bay");
    await dialog.getByRole("combobox", { name: "Tell me about new homes" }).selectOption("weekly");
    await dialog.getByRole("button", { name: "Save search" }).click();
    await expect(page.getByText("Search saved. We'll let you know about new homes.")).toBeVisible();
    await expect(dialog).toBeHidden();

    await page.goto("/account/searches");
    const main = page.getByRole("main");
    await expect(main.getByRole("textbox", { name: "Name" })).toHaveValue("Two beds by the bay");
    const alerts = main.getByRole("combobox", { name: "Alerts: Two beds by the bay" });
    await expect(alerts).toHaveValue("weekly");
    await expect(main.getByRole("link", { name: "See homes" })).toHaveAttribute("href", /beds=2/);
    await expect(main.getByText("No new homes yet")).toBeVisible();
    await snap(page, "account-searches");

    await alerts.selectOption("off");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.reload();
    await expect(main.getByRole("combobox", { name: "Alerts: Two beds by the bay" })).toHaveValue(
      "off",
    );

    await main.getByRole("button", { name: "Delete: Two beds by the bay" }).click();
    await expect(page.getByText("Search deleted. Its alerts have stopped.")).toBeVisible();
    await expect(main.getByText(/tap “Save search” to hear about new ones/)).toBeVisible();
  });

  test("the account pages: past activity linked, lists shared, profile and notifications", async ({
    page,
    request,
    browser,
  }) => {
    const [a, b] = await seed(request);
    const email = uniqueEmail("lina");
    // Before signing up, they asked about a home and booked a tour (as a guest, same email).
    const q = async (sql: string, params: unknown[] = []) => (await db().query(sql, params)).rows;
    const [contact] = await q(
      `insert into contacts (id, agency_id, name, email) values (gen_random_uuid(), $1, 'Lina Haddad', $2) returning id`,
      [AGENCY, email],
    );
    const [lead] = await q(
      `insert into leads (id, agency_id, contact_id, source, property_ids) values (gen_random_uuid(), $1, $2, 'form', array[$3::uuid]) returning id`,
      [AGENCY, contact.id, a.id],
    );
    await q(
      `insert into lead_events (id, agency_id, lead_id, type, body, actor_type) values (gen_random_uuid(), $1, $2, 'created', 'Is parking included?', 'customer')`,
      [AGENCY, lead.id],
    );
    await q(
      `insert into viewings (id, agency_id, contact_id, lead_id, property_id, starts_at, ends_at, status)
       values (gen_random_uuid(), $1, $2, $3, $4, now() + interval '2 days', now() + interval '2 days 30 minutes', 'confirmed')`,
      [AGENCY, contact.id, lead.id, b.id],
    );

    await newCustomer(page, email);
    await expect(page.getByRole("heading", { name: "Hello, Lina" })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Account" });
    for (const item of [
      "Overview",
      "Saved homes",
      "Saved searches",
      "Tours",
      "Inquiries",
      "Chats",
      "Compare",
      "Profile",
      "Notifications",
      "Privacy",
    ])
      await expect(nav.getByRole("link", { name: item, exact: true })).toBeVisible();

    // Tours and inquiries made before the account are theirs now.
    await nav.getByRole("link", { name: "Tours", exact: true }).click();
    const main = page.getByRole("main");
    const upcoming = main.getByRole("region", { name: "Upcoming" });
    await expect(upcoming.getByRole("link", { name: b.title })).toBeVisible();
    await expect(upcoming.getByRole("link", { name: "Change or cancel" })).toHaveAttribute(
      "href",
      /^\/viewings\//,
    );
    await nav.getByRole("link", { name: "Inquiries", exact: true }).click();
    await expect(main.getByText("Website form")).toBeVisible();
    await expect(main.getByText("Is parking included?")).toBeVisible();
    await expect(main.getByRole("link", { name: new RegExp(a.title) })).toBeVisible();

    // Save a home from the results (signed in: no prompt), then organise it.
    await page.goto("/buy");
    await page.getByRole("button", { name: `Save: ${a.title}` }).click();
    await expect(
      page.getByRole("button", { name: `Remove from saved: ${a.title}` }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.goto("/account/saved");
    await main.getByRole("textbox", { name: "List name" }).fill("For later");
    await main.getByRole("button", { name: "Create" }).click();
    await expect(main.getByRole("button", { name: "For later (0)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await main.getByRole("button", { name: "Saved (1)" }).click();
    await main
      .getByRole("combobox", { name: `Move to: ${a.title}` })
      .selectOption({ label: "For later" });
    await main.getByRole("button", { name: "For later (1)" }).click();
    const note = main.getByRole("textbox", { name: `Your note: ${a.title}` });
    await note.fill("Ask about parking");
    await note.blur();
    await expect(page.getByText("Note saved")).toBeVisible();

    // Share the list: a guest sees the homes (not the note); stopping sharing ends the link.
    await main.getByRole("button", { name: "Share this list" }).click();
    const link = main.locator("code").filter({ hasText: "/lists/" });
    const token = /\/lists\/([A-Za-z0-9_-]+)/.exec((await link.textContent()) ?? "")![1]!;
    await snap(page, "account-saved");
    const guest = await (await browser.newContext({ storageState: decidedCookies })).newPage();
    await guest.goto(`/lists/${token}`);
    await expect(
      guest.getByRole("heading", { name: "For later: homes shared with you" }),
    ).toBeVisible();
    await expect(guest.getByRole("link", { name: a.title })).toBeVisible();
    await expect(guest.getByText("Ask about parking")).toHaveCount(0);
    await expect(guest.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
    await main.getByRole("button", { name: "Stop sharing" }).click();
    await expect(main.getByRole("button", { name: "Share this list" })).toBeVisible();
    await expectNotFoundPage(guest, `/lists/${token}`);
    await guest.context().close();

    // Profile and notification choices stick.
    await nav.getByRole("link", { name: "Profile", exact: true }).click();
    await expect(main.getByRole("textbox", { name: "Email" })).toHaveValue(email);
    await main.getByRole("textbox", { name: "Name" }).fill("Lina Mansour");
    await main.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Profile saved")).toBeVisible();

    await nav.getByRole("link", { name: "Notifications", exact: true }).click();
    const priceDrops = main.getByRole("checkbox", { name: "Price drops: Email" });
    await expect(priceDrops).toBeChecked();
    await priceDrops.uncheck();
    await main.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Choices saved")).toBeVisible();
    await page.reload();
    await expect(main.getByRole("checkbox", { name: "Price drops: Email" })).not.toBeChecked();

    await nav.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hello, Lina" })).toBeVisible();
  });

  test("a customer downloads their data, then deletes the account", async ({ page, request }) => {
    const [home] = await seed(request);
    const email = uniqueEmail("leaver");
    await newCustomer(page, email);
    await page.goto(`/property/${home.slug}`);
    await page.getByRole("button", { name: `Save: ${home.title}` }).click();
    await expect(
      page.getByRole("button", { name: `Remove from saved: ${home.title}` }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.goto("/account/privacy");
    const main = page.getByRole("main");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      main.getByRole("link", { name: "Download my data" }).click(),
    ]);
    const data = JSON.parse(readFileSync((await download.path())!, "utf8"));
    expect(data.profile.email).toBe(email);
    expect(data.savedHomes).toHaveLength(1);

    const confirm = main.getByRole("textbox", { name: "Type DELETE to confirm" });
    // Anything but DELETE (in any case) is refused.
    await confirm.fill("remove");
    await main.getByRole("button", { name: "Delete my account" }).click();
    await expect(main.getByText("Type DELETE to confirm.", { exact: true })).toBeVisible();
    await expectPath(page, "/account/privacy");
    await confirm.fill("DELETE");
    await main.getByRole("button", { name: "Delete my account" }).click();
    await expectPath(page, "/");

    await page.goto("/account");
    await expectPath(page, "/sign-in");
    const { rows } = await db().query(
      "select (select count(*)::int from users where lower(email) = lower($1)) as users, (select count(*)::int from audit_log where action = 'account.delete' and created_at > now() - interval '5 minutes') as audits",
      [email],
    );
    expect(rows[0]).toMatchObject({ users: 0 });
    expect(rows[0].audits).toBeGreaterThan(0);
  });
});
