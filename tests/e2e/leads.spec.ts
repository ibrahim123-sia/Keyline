import { expect, test } from "@playwright/test";
import { clearLeads, clearListings, db, signInAsAdmin, snap } from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

test("leads: list -> lead page -> note, stage, shortlist; board move with a lost reason", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await clearLeads();
  await clearListings();
  await db().query("delete from lead_stages");
  const q = async (sql: string, params: unknown[] = []) => (await db().query(sql, params)).rows;
  const stages = await q(
    `insert into lead_stages (id, agency_id, name, sort_order, kind) values
       (gen_random_uuid(), $1, 'New', 0, 'open'),
       (gen_random_uuid(), $1, 'Contacted', 1, 'open'),
       (gen_random_uuid(), $1, 'Won', 2, 'won'),
       (gen_random_uuid(), $1, 'Lost', 3, 'lost')
     returning id, name`,
    [AGENCY],
  );
  const fresh = stages.find((s) => s.name === "New")!;
  const [asked] = await q(
    `insert into properties (id, agency_id, reference, title, slug, purpose, status, published_at, price, currency)
     values (gen_random_uuid(), $1, 'E2E-L1', 'E2E asked-about home', 'e2e-asked-home', 'sale', 'available', now(), 180000000, 'AED')
     returning id`,
    [AGENCY],
  );
  await q(
    `insert into properties (id, agency_id, reference, title, slug, purpose, status, published_at, price, currency)
     values (gen_random_uuid(), $1, 'E2E-L2', 'E2E matching home', 'e2e-matching-home', 'sale', 'available', now(), 190000000, 'AED')`,
    [AGENCY],
  );
  const [contact] = await q(
    `insert into contacts (id, agency_id, name, email) values (gen_random_uuid(), $1, 'Sara E2E', 'sara.e2e@example.com') returning id`,
    [AGENCY],
  );
  const touch = JSON.stringify({
    channel: "paid_search",
    utm_source: "google",
    utm_campaign: "e2e-campaign",
    gclid: "x",
    landing_path: "/property/e2e-asked-home",
    at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  });
  const [lead] = await q(
    `insert into leads (id, agency_id, contact_id, type, stage_id, source, source_detail, property_ids, requirements, first_touch, last_touch, response_due_at)
     values (gen_random_uuid(), $1, $2, 'buyer', $3, 'form', 'listing', array[$4]::uuid[], '{"purpose":"sale"}', $5::jsonb, $5::jsonb, now() - interval '5 minutes')
     returning id`,
    [AGENCY, contact.id, fresh.id, asked.id, touch],
  );
  await q(
    `insert into lead_events (id, agency_id, lead_id, type, body, meta, actor_type) values
       (gen_random_uuid(), $1, $2, 'created', 'Is it still available?', $3::jsonb, 'customer')`,
    [AGENCY, lead.id, JSON.stringify({ source: "form", propertyId: asked.id })],
  );

  await signInAsAdmin(page, request);

  // The list: the lead is there, unanswered, with its source and campaign.
  await page.goto("/admin/leads");
  const row = page.getByRole("row").filter({ hasText: "Sara E2E" });
  await expect(row).toContainText("e2e-campaign");
  await expect(row).toContainText("Waiting");
  await snap(page, "leads-list");
  await row.getByRole("link", { name: "Sara E2E" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/leads/${lead.id}$`));
  await expect(page.getByRole("heading", { name: "Sara E2E", level: 1 })).toBeVisible();
  await expect(
    page.getByText(/^First came from Google Ads \(campaign e2e-campaign\)/),
  ).toBeVisible();

  // A note goes on the timeline.
  const composer = page.getByRole("region", { name: "Add to the timeline" });
  await composer.getByRole("textbox", { name: "Note" }).fill("Prefers a high floor");
  await composer.getByRole("button", { name: "Add note" }).click();
  const timeline = page.getByRole("list", { name: "Timeline" });
  await expect(timeline.getByText("Prefers a high floor")).toBeVisible();

  // Stage change from the header.
  await page
    .getByRole("combobox", { name: "Stage", exact: true })
    .selectOption({ label: "Contacted" });
  await expect
    .poll(
      async () =>
        (
          await q(
            "select s.name from leads l join lead_stages s on s.id = l.stage_id where l.id = $1",
            [lead.id],
          )
        )[0]?.name,
    )
    .toBe("Contacted");
  await expect(timeline.getByText("Moved to Contacted")).toBeVisible();

  // Send the matching home as a shortlist and open it like the lead would.
  const matches = page.getByRole("region", { name: "Matching homes" });
  await expect(matches.getByRole("link", { name: /E2E-L2/ })).toBeVisible();
  await matches.getByRole("button", { name: "Send to lead" }).click();
  const send = page.getByRole("dialog", { name: "Send homes" });
  await send.getByRole("button", { name: "Send", exact: true }).click();
  await expect(send.getByText("Emailed. The link:")).toBeVisible();
  const url = await send.locator("code").innerText();
  await snap(page, "lead-page");
  await page.goto(new URL(url).pathname);
  await expect(
    page.getByRole("heading", { name: "Homes picked for Sara", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /E2E matching home/ })).toBeVisible();
  await expect
    .poll(
      async () =>
        (await q("select open_count from shortlists where lead_id = $1", [lead.id]))[0]?.open_count,
    )
    .toBe(1);
  await expect
    .poll(
      async () =>
        (await q(`select count(*)::int as n from email_log where template = 'shortlist.sent'`))[0]
          ?.n,
    )
    .toBe(1);

  // The board: move the card to Lost, which asks why.
  await page.goto("/admin/leads?view=board");
  await expect(page.getByRole("region", { name: "Contacted, 1 lead" })).toBeVisible();
  await page.getByRole("combobox", { name: "Move Sara E2E" }).selectOption({ label: "Lost" });
  const why = page.getByRole("dialog", { name: "Why was this lead lost?" });
  await why.getByRole("combobox", { name: "Reason" }).click();
  await page.getByRole("option", { name: "Not responsive" }).click();
  await why.getByRole("button", { name: "Mark as lost" }).click();
  await expect(why).toBeHidden();
  await expect
    .poll(
      async () => (await q("select status, lost_reason from leads where id = $1", [lead.id]))[0],
    )
    .toEqual({ status: "lost", lost_reason: "Not responsive" });
  await expect(page.getByRole("region", { name: "Lost, 1 lead" })).toBeVisible();
  await snap(page, "leads-board");

  await clearLeads();
  await clearListings();
});
