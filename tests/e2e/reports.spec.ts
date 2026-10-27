import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { clearLeads, db, signInAsAdmin, snap } from "./helpers";

const AGENCY = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

test("dashboard KPIs, a report with another period, and its CSV export", async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await clearLeads();
  const contact = await db().query<{ id: string }>(
    `insert into contacts (id, agency_id, name) values (gen_random_uuid(), $1, 'Propel Report Contact') returning id`,
    [AGENCY],
  );
  const lead = (source: string, hoursAgo: number, won = false) =>
    db().query(
      `insert into leads (id, agency_id, contact_id, source, status, created_at, won_at, deal_value, deal_currency)
       values (gen_random_uuid(), $1, $2, $3, $4, now() - make_interval(hours => $5),
               ${won ? "now() - interval '30 minutes'" : "null"}, ${won ? "50000000" : "null"}, null)`,
      [AGENCY, contact.rows[0]!.id, source, won ? "won" : "open", hoursAgo],
    );
  await lead("form", 2);
  await lead("form", 3, true);
  await lead("portal", 5);
  // Long before the period: not counted.
  await lead("form", 24 * 200);

  await signInAsAdmin(page, request);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  const tiles = page.getByRole("list", { name: "Key numbers" });
  const leadsTile = tiles.locator('[data-kpi="leads"]');
  await expect(leadsTile).toContainText("Leads");
  await expect(leadsTile).toContainText("3");
  await expect(tiles.locator('[data-kpi="won"]')).toContainText("1");
  // Open leads waiting for a first reply right now, whenever they came in.
  await expect(tiles.locator('[data-kpi="unanswered"]')).toContainText("3");
  await snap(page, "dashboard");

  // Into the sources report from the dashboard's report list.
  await page.getByRole("link", { name: /^Sources and campaigns/ }).click();
  await expect(
    page.getByRole("heading", { name: "Sources and campaigns", level: 1 }),
  ).toBeVisible();
  const table = page.locator('[data-report-table="sources"]');
  await expect(table.getByRole("row", { name: /Website form/ })).toContainText("2");
  await expect(table.getByRole("row", { name: /Property portal/ })).toContainText("1");

  // Another period: the URL carries it and the page says which dates it shows.
  await page.getByRole("combobox", { name: "Period", exact: true }).selectOption("7d");
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page).toHaveURL(/[?&]period=7d/);
  await expect(page.locator("[data-period]")).toContainText("Compared with");
  await snap(page, "report-sources");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^report-sources-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("Website form,2,");
  expect(csv).not.toContain("Propel Report Contact");
  await expect
    .poll(
      async () =>
        (
          await db().query(
            "select count(*)::int as n from audit_log where action = 'report.export'",
          )
        ).rows[0]!.n,
    )
    .toBeGreaterThan(0);
});
