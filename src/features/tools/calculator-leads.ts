import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { agents } from "@/db/schema/people";
import { properties } from "@/db/schema/properties";
import { captureLead } from "@/features/leads/capture";
import { liveStatuses } from "@/features/properties/status";
import { loadSettings } from "@/features/settings/queries";
import { ActionError } from "@/lib/actions";
import { format } from "@/lib/i18n";
import { calculators as t } from "@/lib/i18n/dictionaries/calculators";
import { formatMoney } from "@/lib/money";
import { enqueue } from "@/jobs/enqueue";
import { newId } from "@/lib/ids";
import { incomeBandLabels, roiInputOf } from "./calculator-params";
import type { preApprovalSchema, roiReportSchema } from "./calculator-schema";
import { mortgage, rentalReturns } from "./math";
import { roiSummary } from "./roi-text";
import type { z } from "zod";

type PreApproval = Omit<z.output<typeof preApprovalSchema>, "consent" | "website" | "captchaToken">;

/** The live listing a calculator was opened from (by its reference), if it is still listed. */
export async function liveListingIdByRef(db: Db, ref: string | null): Promise<string | null> {
  if (!ref) return null;
  const [row] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.agencyId, currentAgencyId()),
        eq(properties.reference, ref),
        isNull(properties.deletedAt),
        inArray(properties.status, [...liveStatuses]),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/** Who answers: the lead's agent, else the agency. */
export async function answeredBy(db: Db, agentId: string | null): Promise<string> {
  const [agent] = agentId
    ? await db
        .select({ name: agents.name, isActive: agents.isActive })
        .from(agents)
        .where(eq(agents.id, agentId))
    : [];
  return agent?.isActive ? agent.name : (await loadSettings("general", db)).agencyName;
}

/**
 * "Get pre-approved" (11 §1, 09 §1 #9): a lead with source `mortgage`, the calculation and
 * the visitor's situation on the timeline, finance "mortgage", and the listing it was opened
 * from as the interest. Returns who will call.
 */
export async function handlePreApproval(
  db: Db,
  input: PreApproval,
  visitorKey: string | null,
): Promise<{ who: string; leadId: string }> {
  const market = await loadSettings("market", db);
  const bands = incomeBandLabels(
    market.mortgage.incomeBands,
    (v) => formatMoney(v, market.baseCurrency),
    {
      under: t.mortgage.preApproval.incomeUnder,
      between: t.mortgage.preApproval.incomeBetween,
      over: t.mortgage.preApproval.incomeOver,
    },
  );
  const band = bands[Number(input.incomeBand)];
  if (!band)
    throw new ActionError("Please check the highlighted fields.", "VALIDATION", {
      incomeBand: ["Choose your monthly income"],
    });

  const c = input.calculation;
  const m = mortgage(c);
  const money = (v: number) => formatMoney(v, market.baseCurrency);
  const calculation = [
    `${money(m.price)} price`,
    `${money(m.downPayment)} down (${Math.round((m.downPayment / m.price) * 1000) / 10}%)`,
    `${c.years} years at ${c.ratePct}%`,
    `${money(m.monthlyPayment)} a month`,
  ].join(", ");
  const propertyId = await liveListingIdByRef(db, input.ref);

  const lead = await captureLead(db, {
    source: "mortgage",
    sourceDetail: "calculator",
    contact: { name: input.name, email: input.email, phone: input.phone },
    propertyId,
    message: null,
    requirements: {
      purpose: "sale",
      finance: "mortgage",
      // Without a listing, the price they worked with is their budget.
      ...(propertyId
        ? {}
        : {
            budgetMax: m.price,
            currency: market.baseCurrency.code,
            budgetFrom: "lead" as const,
          }),
    },
    details: {
      calculation,
      monthlyIncome: format(`{band} ${t.common.perMonth}`, { band }),
      employment: t.mortgage.preApproval.employmentTypes[input.employment],
      downPaymentReady:
        input.downPaymentReady === "yes"
          ? t.mortgage.preApproval.yes
          : t.mortgage.preApproval.notYet,
    },
    visitorKey,
  });
  return { who: await answeredBy(db, lead.agentId), leadId: lead.leadId };
}

type RoiReport = Omit<z.output<typeof roiReportSchema>, "consent" | "website" | "captchaToken">;

/**
 * "Email me this report" (11 §2, 09 §1 #10): a lead with source `roi` (type investor when the
 * agency uses it) carrying the results, then the `tools.roi_report` job makes the PDF and
 * emails the link. Returns the lead.
 */
export async function handleRoiReport(
  db: Db,
  input: RoiReport,
  visitorKey: string | null,
): Promise<{ leadId: string; reportId: string }> {
  const market = await loadSettings("market", db);
  const c = input.calculation;
  const result = rentalReturns(roiInputOf(c));
  const propertyId = await liveListingIdByRef(db, c.ref);
  const lead = await captureLead(db, {
    source: "roi",
    sourceDetail: "rental returns",
    type: "investor",
    contact: {
      name: input.name || input.email,
      email: input.email,
      phone: input.phone || null,
    },
    propertyId,
    message: null,
    requirements: {
      purpose: "sale",
      ...(c.mortgageOn ? { finance: "mortgage" as const } : {}),
      ...(propertyId
        ? {}
        : { budgetMax: c.price, currency: market.baseCurrency.code, budgetFrom: "lead" as const }),
    },
    details: { report: roiSummary(result, (v) => formatMoney(v, market.baseCurrency)) },
    visitorKey,
  });
  const reportId = newId();
  await enqueue(
    "tools.roi_report",
    {
      reportId,
      leadId: lead.leadId,
      email: input.email,
      name: input.name,
      calculation: c,
    },
    { db, dedupeKey: `tools.roi_report:${reportId}` },
  );
  return { leadId: lead.leadId, reportId };
}
