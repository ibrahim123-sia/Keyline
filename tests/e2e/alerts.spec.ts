import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { db } from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

test("alerts: the unsubscribe link in an alert email switches the search off", async ({ page }) => {
  const userId = randomUUID();
  const searchId = randomUUID();
  const token = "e2eUnsubscribeToken0123456789abc"; // 32 characters, like a real one
  await db().query("delete from users where email = 'e2e-alerts@example.com'");
  await db().query(
    `insert into users (id, agency_id, name, email, role) values ($1, $2, 'E2E Alerts', 'e2e-alerts@example.com', 'customer')`,
    [userId, AGENCY],
  );
  await db().query(
    `insert into saved_searches (id, agency_id, user_id, name, filters, alert_frequency, unsubscribe_token_hash)
     values ($1, $2, $3, 'E2E marina homes', '{"loc":["dubai-marina"]}', 'instant', $4)`,
    [searchId, AGENCY, userId, createHash("sha256").update(token).digest("hex")],
  );

  await page.goto(`/api/alerts/unsubscribe?token=${token}`);
  await expect(page).toHaveURL(/\/alerts\/unsubscribed\?search=E2E/);
  await expect(
    page.getByText("You won't get alerts for “E2E marina homes” any more."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage your alerts" })).toHaveAttribute(
    "href",
    "/account/searches",
  );
  const { rows } = await db().query("select alert_frequency from saved_searches where id = $1", [
    searchId,
  ]);
  expect(rows[0].alert_frequency).toBe("off");

  // A link that is not ours explains itself.
  await page.goto("/api/alerts/unsubscribe?token=not-a-real-token");
  await expect(page.getByText("This link no longer works.")).toBeVisible();
  await db().query("delete from users where id = $1", [userId]);
});
