import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { contacts, leadEvents, leads } from "@/db/schema/crm";
import { agents } from "@/db/schema/people";
import { properties } from "@/db/schema/properties";
import { patchSettings } from "@/features/settings/mutations";
import { emailRoiReport, sendPreApproval } from "@/features/tools/calculator-actions";
import { handlePreApproval } from "@/features/tools/calculator-leads";
import { reportKey } from "@/features/tools/roi-report";
import { emailLog, jobRuns } from "@/db/schema/system";
import { runDueJobs } from "@/jobs/runner";
import { newId } from "@/lib/ids";
import { memoryStorage, setStorage } from "@/lib/storage";
import { GET as downloadReport } from "@/app/api/tools/roi-report/[token]/route";
import { testAdmin } from "../helpers/admin-context";
import { truncate } from "../helpers/db";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));

const actor = { type: "admin" as const, id: testAdmin.id };

const calculation = {
  price: 230_000_000,
  downPayment: 46_000_000,
  years: 25,
  ratePct: 4.5,
  registrationFeePct: 4,
  agencyFeePct: 2,
  arrangementFeePct: 1,
};

async function world() {
  const db = await getDb();
  await patchSettings(
    db,
    "market",
    {
      baseCurrency: { code: "AED", symbol: "AED", symbolPosition: "before", decimals: 2 },
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
    },
    actor,
  );
  await patchSettings(db, "leads", { assignmentRule: "listing_agent" }, actor);
  const agentId = newId();
  await db.insert(agents).values({ id: agentId, name: "Layla Haddad", slug: "layla" });
  const listingId = newId();
  await db.insert(properties).values({
    id: listingId,
    reference: "HD-2041",
    title: "Two bed with a marina view",
    slug: "two-bed-marina",
    purpose: "sale",
    status: "available",
    publishedAt: new Date(),
    price: 230_000_000,
    currency: "AED",
    agentId,
  });
  return { db, listingId };
}

describe("mortgage pre-approval (11 §1)", () => {
  beforeEach(async () => {
    await truncate(
      "contacts",
      "leads",
      "lead_events",
      "lead_tasks",
      "property_daily_stats",
      "properties",
      "agents",
      "job_runs",
      "rate_limits",
    );
  });

  it("becomes a mortgage lead on the listing, with the calculation and their situation", async () => {
    const { db, listingId } = await world();
    const res = await handlePreApproval(
      db,
      {
        name: "Sam Buyer",
        email: "Sam@Example.com",
        phone: "050 123 4567",
        incomeBand: "1",
        employment: "self_employed",
        downPaymentReady: "yes",
        calculation,
        ref: "HD-2041",
      },
      null,
    );
    expect(res.who).toBe("Layla Haddad");
    const [lead] = await db.select().from(leads).where(eq(leads.id, res.leadId));
    expect(lead).toMatchObject({
      source: "mortgage",
      sourceDetail: "calculator",
      type: "buyer",
      propertyIds: [listingId],
    });
    expect(lead!.requirements).toMatchObject({ purpose: "sale", finance: "mortgage" });
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, lead!.contactId));
    expect(contact).toMatchObject({ email: "sam@example.com", phone: "+971501234567" });
    const [event] = await db
      .select()
      .from(leadEvents)
      .where(and(eq(leadEvents.leadId, res.leadId), eq(leadEvents.type, "created")));
    expect((event!.meta as { details: unknown }).details).toEqual({
      calculation:
        "AED 2,300,000 price, AED 460,000 down (20%), 25 years at 4.5%, AED 10,227.32 a month",
      monthlyIncome: "AED 15,000 to AED 30,000 a month",
      employment: "Self-employed",
      downPaymentReady: "Yes",
    });
  });

  it("without a listing, the price they worked with is the budget", async () => {
    const { db } = await world();
    const res = await handlePreApproval(
      db,
      {
        name: "Ana",
        email: "ana@example.com",
        phone: "+971 50 999 0000",
        incomeBand: "0",
        employment: "employed",
        downPaymentReady: "no",
        calculation,
        ref: null,
      },
      null,
    );
    const [lead] = await db.select().from(leads).where(eq(leads.id, res.leadId));
    expect(lead!.propertyIds).toEqual([]);
    expect(lead!.requirements).toMatchObject({
      budgetMax: 230_000_000,
      currency: "AED",
      budgetFrom: "lead",
      finance: "mortgage",
    });
  });

  it("the action checks the form, the consent and the income band", async () => {
    await world();
    const base = {
      name: "Sam",
      email: "sam@example.com",
      phone: "0501234567",
      incomeBand: "1",
      employment: "employed" as const,
      downPaymentReady: "yes" as const,
      consent: true as const,
      calculation,
    };
    const noConsent = await sendPreApproval({ ...base, consent: false as unknown as true });
    expect(noConsent).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(noConsent.ok ? null : noConsent.fieldErrors).toHaveProperty("consent");
    const badBand = await sendPreApproval({ ...base, incomeBand: "7" });
    expect(badBand.ok ? null : badBand.fieldErrors).toHaveProperty("incomeBand");
    // A bot filling the honeypot is told it worked; nothing is stored.
    expect(await sendPreApproval({ ...base, website: "spam.example" })).toEqual({
      ok: true,
      data: { who: "" },
    });
    expect(await (await getDb()).select().from(leads)).toHaveLength(0);
    // No listing: the rule falls through to round robin (decision 55).
    expect(await sendPreApproval(base)).toEqual({ ok: true, data: { who: "Layla Haddad" } });
  });
});

const roiCalculation = {
  price: 200_000_000,
  purchaseCostsPct: 4,
  mode: "long" as const,
  rentYearly: 14_000_000,
  nightlyHigh: 0,
  nightlyLow: 0,
  highSeasonMonths: 6,
  occupancyPct: 70,
  managementFeePct: 20,
  serviceChargePerArea: 1_500,
  size: 1_000,
  maintenancePct: 1,
  vacancyPct: 5,
  mortgageOn: false,
  downPct: 20,
  ratePct: 5,
  years: 25,
  rentGrowthPct: 0,
  priceGrowthPct: 0,
  ref: "HD-2041",
};

describe("rental return report (11 §2)", () => {
  beforeEach(async () => {
    await truncate(
      "contacts",
      "leads",
      "lead_events",
      "lead_tasks",
      "property_daily_stats",
      "properties",
      "agents",
      "job_runs",
      "rate_limits",
      "email_log",
    );
  });

  it("makes a roi lead, then the PDF and an email with a private download link", async () => {
    const { db, listingId } = await world();
    const storage = memoryStorage();
    setStorage(storage);
    try {
      const res = await emailRoiReport({
        email: "investor@example.com",
        name: "Ria Investor",
        phone: "",
        consent: true,
        calculation: roiCalculation,
      });
      expect(res).toEqual({ ok: true, data: { email: "investor@example.com" } });
      const [lead] = await db.select().from(leads);
      expect(lead).toMatchObject({ source: "roi", propertyIds: [listingId] });
      const [created] = await db
        .select()
        .from(leadEvents)
        .where(and(eq(leadEvents.leadId, lead!.id), eq(leadEvents.type, "created")));
      expect((created!.meta as { details: unknown }).details).toEqual({
        report:
          "Gross yield 7% · Net yield 4.7% · Net cash flow AED 98,000 a year · IRR 4.4% over 10 years",
      });
      const [job] = await db.select().from(jobRuns).where(eq(jobRuns.name, "tools.roi_report"));
      expect(job).toBeDefined();

      for (let i = 0; i < 5; i++) if ((await runDueJobs()).ran === 0) break;
      const reportId = (job!.payload as { reportId: string }).reportId;
      const pdf = await storage.getBytes(reportKey(reportId));
      expect(new TextDecoder("latin1").decode(pdf!.slice(0, 5))).toBe("%PDF-");

      const emails = await db
        .select()
        .from(emailLog)
        .where(eq(emailLog.template, "tools.roi_report"));
      expect(emails).toHaveLength(1);
      expect(emails[0]).toMatchObject({ to: "investor@example.com", relatedId: reportId });
      expect(emails[0]!.text).toContain("Net yield 4.7%");
      // No generic auto-reply: the report is the reply.
      expect(
        await db.select().from(emailLog).where(eq(emailLog.template, "lead.auto_reply")),
      ).toHaveLength(0);

      const link = /\/api\/tools\/roi-report\/([A-Za-z0-9_.-]+)/.exec(emails[0]!.html!)![1]!;
      const ok = await downloadReport(new Request("http://localhost/x"), {
        params: Promise.resolve({ token: link }),
      });
      expect(ok.status).toBe(200);
      expect(ok.headers.get("content-type")).toBe("application/pdf");
      expect(ok.headers.get("cache-control")).toBe("private, no-store");
      const forged = await downloadReport(new Request("http://localhost/x"), {
        params: Promise.resolve({ token: `${link.slice(0, -2)}xx` }),
      });
      expect(forged.status).toBe(404);

      // A retried job does not email twice.
      await db
        .update(jobRuns)
        .set({ status: "queued", runAfter: new Date() })
        .where(eq(jobRuns.id, job!.id));
      for (let i = 0; i < 3; i++) if ((await runDueJobs()).ran === 0) break;
      expect(
        await db.select().from(emailLog).where(eq(emailLog.template, "tools.roi_report")),
      ).toHaveLength(1);
    } finally {
      setStorage(null);
    }
  }, 90_000);
});
