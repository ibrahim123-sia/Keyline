import { expect, test } from "@playwright/test";
import { db, signInAsAdmin } from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

test("system page: a job that gave up is shown with its error and can be retried", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await db().query("delete from job_runs");
  await db().query(
    `insert into job_runs (id, agency_id, name, status, attempts, max_attempts, last_error, payload)
     values (gen_random_uuid(), $1, 'email.send', 'dead', 5, 5, 'Resend answered 500: try later', '{"emailId":"e2e"}')`,
    [AGENCY],
  );
  await signInAsAdmin(page, request);
  await page.goto("/admin/settings/system");
  await expect(page.getByRole("heading", { name: "System", level: 1 })).toBeVisible();

  const queue = page.getByRole("region", { name: "Job queue" });
  await expect(queue.getByText("Gave up")).toBeVisible();
  const row = page.getByRole("row", { name: /email\.send/ });
  await expect(row).toContainText("Gave up");
  await expect(row).toContainText("Resend answered 500");

  await row.getByText("email.send").click();
  const panel = page.getByRole("dialog", { name: "email.send" });
  await expect(panel.getByText('"emailId": "e2e"')).toBeVisible();
  await panel.getByRole("button", { name: "Retry now" }).click();
  await expect(page.getByText("1 job sent again")).toBeVisible();
  await expect
    .poll(async () => (await db().query("select max_attempts from job_runs")).rows[0]!.max_attempts)
    .toBeGreaterThan(5);
});
