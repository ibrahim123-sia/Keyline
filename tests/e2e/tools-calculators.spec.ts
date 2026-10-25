import { expect, test } from "@playwright/test";
import { clearLeads, db, setSettings, snap } from "./helpers";

/** AED market with the calculator limits and income bands used below (11 §1, §2). */
async function market(request: Parameters<typeof setSettings>[0]) {
  await setSettings(request, "market", {
    baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
    areaUnit: "sqft",
    phoneCountryCode: "+971",
    mortgage: {
      downPaymentPct: 20,
      interestRatePct: 5,
      years: 25,
      maxLtvPct: 80,
      maxYears: 30,
      registrationFeePct: 4,
      agencyFeePct: 2,
      arrangementFeePct: 1,
      incomeBands: [1_500_000, 3_000_000],
    },
    roi: {
      serviceChargePerArea: 1_500,
      managementFeePct: 20,
      occupancyPct: 70,
      purchaseCostsPct: 4,
      maintenancePct: 1,
      vacancyPct: 5,
      rentGrowthPct: 0,
      priceGrowthPct: 0,
    },
  });
}

test("mortgage calculator: the numbers, a share link and a pre-approval lead", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop flow");
  test.setTimeout(240_000);
  await market(request);
  await clearLeads();
  await page.goto(
    "/tools/mortgage?price=2300000&down=20&years=25&rate=4.5&reg=4&agency=2&arr=1&ref=NOPE-1",
  );
  await expect(page.getByRole("heading", { name: "Mortgage calculator", level: 1 })).toBeVisible();
  const results = page.getByRole("region", { name: "Your estimate" });
  // 1,840,000 over 25 years at 4.5%: 10,227.32 a month, 1,228,195.28 of interest.
  await expect(results).toContainText("AED 10,227.32");
  await expect(results).toContainText("AED 1,840,000");
  await expect(results).toContainText("AED 1,228,195.28");
  // 460,000 down + 92,000 registration + 46,000 agency + 18,400 arrangement.
  await expect(results).toContainText("AED 616,400");
  await expect(
    page.getByText("Estimate only. Your bank will confirm the final numbers."),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /principal and interest paid each year/i }),
  ).toBeVisible();

  // A new rate updates the estimate, the address and the share link.
  const rate = page.getByRole("spinbutton", { name: "Interest rate", exact: true });
  await rate.fill("5");
  await expect(results).toContainText("AED 10,756.46");
  await expect(page).toHaveURL(/rate=5(&|$)/);
  const share = await page
    .getByRole("button", { name: "Copy share link" })
    .getAttribute("data-share-url");
  expect(share).toContain("rate=5");
  await snap(page, "tools-mortgage");

  const shared = await page.context().newPage();
  await shared.goto(share!);
  await expect(shared.getByRole("region", { name: "Your estimate" })).toContainText(
    "AED 10,756.46",
  );
  await shared.close();

  // Get pre-approved: a lead with source mortgage.
  await page.getByRole("button", { name: "Get pre-approved" }).click();
  const dialog = page.getByRole("dialog", { name: "Get pre-approved" });
  await dialog.getByRole("textbox", { name: "Name" }).fill("Sam Buyer");
  await dialog.getByRole("textbox", { name: "Phone" }).fill("050 123 4567");
  await dialog.getByRole("textbox", { name: "Email" }).fill("sam.buyer@example.com");
  await dialog
    .getByRole("combobox", { name: "Monthly income" })
    .selectOption({ label: "AED 15,000 to AED 30,000" });
  await dialog.getByRole("combobox", { name: "Employment" }).selectOption("employed");
  await dialog.getByRole("radio", { name: "Yes" }).check();
  await dialog
    .getByRole("checkbox", { name: "I agree to be contacted about a mortgage pre-approval." })
    .check();
  await dialog.getByRole("button", { name: "Ask for a pre-approval" }).click();
  await expect(dialog.getByText(/Thank you, Sam\./)).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await db().query(
            `select l.source, c.email from leads l join contacts c on c.id = l.contact_id`,
          )
        ).rows,
    )
    .toEqual([{ source: "mortgage", email: "sam.buyer@example.com" }]);
});

test("rental return simulator: yields, returns and the emailed report", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop flow");
  test.setTimeout(240_000);
  await market(request);
  await clearLeads();
  await db().query(`delete from email_log where template = 'tools.roi_report'`);
  await page.goto(
    "/tools/rental-returns?price=2000000&pc=4&mode=long&rent=140000&vac=5&sc=15&size=1000&maint=1&rg=0&pg=0",
  );
  await expect(
    page.getByRole("heading", { name: "Rental return simulator", level: 1 }),
  ).toBeVisible();
  const results = page.getByRole("region", { name: "Your returns" });
  // Gross 7%; net 98,000 over 2,080,000 = 4.7%; IRR 4.4%; paid back in year 22.
  await expect(results).toContainText("7%");
  await expect(results).toContainText("4.7%");
  await expect(results).toContainText("AED 98,000 a year");
  await expect(results).toContainText("4.4%");
  await expect(results).toContainText("Year 22");
  const summary = page.getByRole("region", { name: "After 5 and 10 years" });
  await expect(summary).toContainText("AED 490,000");
  await expect(summary).toContainText("AED 900,000");
  await expect(page.getByRole("region", { name: "Assumptions" })).toContainText(
    "5% of the rent is lost to empty periods between tenants.",
  );
  await expect(page.getByRole("img", { name: /equity reaches/i })).toBeVisible();

  // Holiday-home mode asks for nightly rates.
  await page.getByText("Holiday home (short-term)").click();
  await expect(results).toContainText("Enter the nightly rates to see the returns.");
  await page.getByText("Long-term tenant").click();
  await expect(results).toContainText("AED 98,000 a year");
  await snap(page, "tools-rental-returns");

  await page.getByRole("button", { name: "Email me this report" }).click();
  const dialog = page.getByRole("dialog", { name: "Email me this report" });
  await dialog.getByRole("textbox", { name: "Email", exact: true }).fill("ria@example.com");
  await dialog.getByRole("textbox", { name: "Name (optional)" }).fill("Ria Investor");
  await dialog
    .getByRole("checkbox", { name: "I agree to be contacted about this report." })
    .check();
  await dialog.getByRole("button", { name: "Send the report" }).click();
  await expect(dialog.getByText(/on its way to ria@example\.com/)).toBeVisible();
  await expect
    .poll(async () => (await db().query(`select source from leads`)).rows)
    .toEqual([{ source: "roi" }]);
  // The job renders the PDF and queues the email with a private link.
  await expect
    .poll(
      async () =>
        (await db().query(`select "to", html from email_log where template = 'tools.roi_report'`))
          .rows.length,
      { timeout: 90_000 },
    )
    .toBe(1);
  const [email] = (
    await db().query(`select "to", html from email_log where template = 'tools.roi_report'`)
  ).rows as Array<{ to: string; html: string }>;
  expect(email!.to).toBe("ria@example.com");
  const link = /href="([^"]*\/api\/tools\/roi-report\/[^"]+)"/.exec(email!.html)![1]!;
  const pdf = await request.get(link.replaceAll("&amp;", "&"));
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
});
