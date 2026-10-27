import { expect, test } from "@playwright/test";
import { db, seedDemo, setSettings, signInAsAdmin, snap } from "./helpers";

/**
 * The admin assistant (10 §3) with the built-in test provider: it answers from the read tools,
 * and a change it proposes waits on a preview card until the admin confirms it.
 */

test.describe.configure({ mode: "serial" });

/** Settings -> Integrations -> AI as a whole (the settings helper merges top-level keys only). */
const aiIntegration = (enabled: boolean) => ({
  ai: {
    enabled,
    provider: "mock",
    chatModel: "claude-sonnet-5-5",
    fastModel: "claude-haiku-5-5",
    gatewayAccountId: "",
    gatewayName: "",
    embeddingProvider: "mock",
    embeddingModel: "@cf/baai/bge-m3",
  },
});

test.beforeAll(async ({ request }) => {
  test.setTimeout(300_000);
  await seedDemo(request);
});

test.afterAll(async ({ request }) => {
  await setSettings(request, "integrations", aiIntegration(false));
});

test("the admin asks, then confirms a price change on the preview card", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await setSettings(request, "integrations", aiIntegration(true));
  const { rows } = await db().query(
    `select id, reference, price from properties
      where status = 'available' and purpose = 'sale' and deleted_at is null
      order by reference limit 1`,
  );
  const listing = rows[0] as { id: string; reference: string; price: string };
  await signInAsAdmin(page, request);

  const input = page.getByRole("textbox", { name: "Ask anything about your agency…" });
  await input.fill(`What is the status of ${listing.reference}?`);
  await input.press("Enter");
  const panel = page.getByRole("dialog", { name: "Assistant" });
  await expect(panel.getByText(new RegExp(`${listing.reference} ·`))).toBeVisible({
    timeout: 60_000,
  });

  const newPrice = Math.round(Number(listing.price) / 100 / 1000) * 1000 - 50_000;
  await panel
    .getByRole("textbox", { name: "Your question" })
    .fill(`Change the price of ${listing.reference} to ${newPrice}`);
  await panel.getByRole("button", { name: "Ask" }).click();
  const card = panel.getByRole("group", { name: new RegExp(`Update ${listing.reference}`) });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await snap(page, "admin-assistant-preview");
  // Nothing has changed yet.
  const before = await db().query("select price from properties where id = $1", [listing.id]);
  expect(before.rows[0].price).toBe(listing.price);

  await card.getByRole("button", { name: "Confirm" }).click();
  await expect(card.getByRole("status")).toContainText("Done");
  const after = await db().query("select price from properties where id = $1", [listing.id]);
  expect(Number(after.rows[0].price)).toBe(newPrice * 100);
  const audit = await db().query(
    "select actor_type, confirmed_by from audit_log where action = 'ai.update_listing' order by created_at desc limit 1",
  );
  expect(audit.rows[0]).toMatchObject({ actor_type: "ai" });
  expect(audit.rows[0].confirmed_by).toBeTruthy();
});
