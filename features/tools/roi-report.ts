import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db/client";
import { leads } from "@/db/schema/crm";
import { agents } from "@/db/schema/people";
import { emailLog } from "@/db/schema/system";
import { loadEmailBrand, type EmailBrand } from "@/emails/brand";
import { renderTemplateEmail } from "@/features/messages/render";
import { queueEmail } from "@/features/notifications/email";
import { loadSettings } from "@/features/settings/queries";
import { defineJob } from "@/jobs/types";
import { format } from "@/lib/i18n";
import { calculators as t } from "@/lib/i18n/dictionaries/calculators";
import { formatMoney, type CurrencyFormat } from "@/lib/money";
import { renderPdf } from "@/lib/pdf/render";
import { signToken, verifyToken } from "@/lib/signed-token";
import { getStorage } from "@/lib/storage";
import { areaUnitLabels, type AreaUnit } from "@/lib/units";
import { roiCalculationSchema, type RoiCalculation } from "./calculator-schema";
import { roiInputOf } from "./calculator-params";
import { BREAK_EVEN_HORIZON_YEARS, rentalReturns, type RoiResult } from "./math";
import { formatPct, roiAssumptions, roiSummary } from "./roi-text";

/**
 * "Email me this report" (11 §2, 09 §1 #10). The PDF is made in a job (a headless browser takes
 * seconds and can fail for a moment; a job retries), kept in private storage and sent as a
 * signed download link that works for REPORT_LINK_DAYS days. A link rather than an attachment:
 * the email stays small and gets through spam filters that hold PDF attachments from new
 * senders, the email log keeps no file, and `email.send` stays as it is.
 */

export const REPORT_LINK_DAYS = 30;
const PURPOSE = "roi-report";

/** Private: /media serves only public upload keys, never this prefix. */
export const reportKey = (reportId: string) => `reports/roi/${reportId}.pdf`;

export async function reportLink(reportId: string): Promise<string> {
  const token = await signToken(PURPOSE, { r: reportId }, REPORT_LINK_DAYS * 86_400);
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/tools/roi-report/${token}`;
}

/** The report id in a download link, or null when the link is forged or expired. */
export async function reportIdFromToken(token: string): Promise<string | null> {
  const payload = await verifyToken<{ r?: unknown }>(PURPOSE, token);
  return typeof payload?.r === "string" && /^[0-9a-f-]{36}$/.test(payload.r) ? payload.r : null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

type ReportData = {
  calc: RoiCalculation;
  result: RoiResult;
  brand: EmailBrand;
  currency: CurrencyFormat;
  areaUnit: AreaUnit;
  name: string;
  date: string;
};

/** The report as one HTML document (inline styles, branding tokens, A4). */
export function reportHtml(d: ReportData): string {
  const money = (v: number) => esc(formatMoney(v, d.currency));
  const c = d.brand.colors;
  const r = d.result;
  const unit = areaUnitLabels[d.areaUnit];
  const home: Array<[string, string]> = [
    [t.roi.price, money(d.calc.price)],
    d.calc.mode === "long"
      ? [t.roi.rent, money(d.calc.rentYearly)]
      : [
          `${t.roi.nightlyHigh} / ${t.roi.nightlyLow}`,
          `${money(d.calc.nightlyHigh)} / ${money(d.calc.nightlyLow)}`,
        ],
    [t.roi.size, `${d.calc.size} ${esc(unit)}`],
    [format(t.roi.serviceCharge, { unit }), money(d.calc.serviceChargePerArea)],
    [t.roi.cashInvestedLabel, money(r.cashInvested)],
  ];
  const tiles: Array<[string, string]> = [
    [t.roi.grossYield, `${formatPct(r.grossYieldPct)}%`],
    [t.roi.netYield, `${formatPct(r.netYieldPct)}%`],
    [`${t.roi.cashFlow} (${t.common.perYear})`, money(r.netCashFlowYear1)],
    [t.roi.irr, r.irrPct === null ? t.roi.irrNone : `${formatPct(r.irrPct)}%`],
    [
      t.roi.breakEven,
      r.breakEvenYear === null
        ? format(t.roi.breakEvenNever, { n: BREAK_EVEN_HORIZON_YEARS })
        : format(t.common.yearN, { n: r.breakEvenYear }),
    ],
  ];
  const at = (i: number) => r.years[i]!;
  const summary = [4, 9].map((i) => at(i));
  const cell = `padding:6px 8px;border-bottom:1px solid ${c.border};text-align:right`;
  const head = `padding:6px 8px;border-bottom:1px solid ${c.border};text-align:right;color:${c.textMuted};font-weight:600`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(t.pdf.title)}</title>
<style>
@page { size: A4; margin: 16mm 14mm; }
* { box-sizing: border-box; }
body { font-family: Helvetica, Arial, sans-serif; color: ${c.text}; font-size: 11pt; margin: 0; }
h1 { color: ${c.ink}; font-size: 22pt; margin: 0 0 4px; font-weight: 600; }
h2 { color: ${c.ink}; font-size: 13pt; margin: 18px 0 8px; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.tiles { display: flex; flex-wrap: wrap; gap: 8px; }
.tile { flex: 1 1 30%; border: 1px solid ${c.border}; border-radius: 10px; padding: 8px 10px; }
.tile b { display: block; color: ${c.ink}; font-size: 15pt; }
.muted { color: ${c.textMuted}; font-size: 9.5pt; }
</style></head><body>
<header style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid ${c.accent};padding-bottom:10px;margin-bottom:14px">
  <div>${
    d.brand.logoUrl
      ? `<img src="${esc(d.brand.logoUrl)}" alt="${esc(d.brand.agencyName)}" style="max-height:40px">`
      : `<strong style="font-size:15pt;color:${c.ink}">${esc(d.brand.agencyName)}</strong>`
  }</div>
  <div class="muted">${esc(
    d.name
      ? format(t.pdf.preparedFor, { name: d.name, date: d.date })
      : format(t.pdf.prepared, { date: d.date }),
  )}</div>
</header>
<h1>${esc(t.pdf.title)}</h1>
${d.calc.ref ? `<p class="muted">${esc(format(t.pdf.listing, { ref: d.calc.ref }))}</p>` : ""}
<h2>${esc(t.pdf.home)}</h2>
<table>${home
    .map(
      ([k, v]) =>
        `<tr><td style="padding:5px 0;border-bottom:1px solid ${c.border}">${esc(k)}</td><td style="padding:5px 0;border-bottom:1px solid ${c.border};text-align:right;color:${c.ink};font-weight:600">${v}</td></tr>`,
    )
    .join("")}</table>
<h2>${esc(t.pdf.results)}</h2>
<div class="tiles">${tiles
    .map(([k, v]) => `<div class="tile"><span class="muted">${esc(k)}</span><b>${esc(v)}</b></div>`)
    .join("")}</div>
<h2>${esc(t.roi.summaryTitle)}</h2>
<table><thead><tr><th style="${head};text-align:left"></th><th style="${head}">${esc(t.roi.after5)}</th><th style="${head}">${esc(t.roi.after10)}</th></tr></thead><tbody>
${(
  [
    [t.roi.cumulativeCashFlow, (y: (typeof summary)[number]) => money(y.cumulativeCashFlow)],
    [t.roi.equity, (y: (typeof summary)[number]) => money(y.equity)],
    [t.roi.totalReturn, (y: (typeof summary)[number]) => money(y.totalReturn)],
  ] as const
)
  .map(
    ([label, fn]) =>
      `<tr><th style="${cell};text-align:left;font-weight:500">${esc(label)}</th>${summary.map((y) => `<td style="${cell}">${fn(y)}</td>`).join("")}</tr>`,
  )
  .join("")}
</tbody></table>
<h2>${esc(t.roi.yearByYear)}</h2>
<table><thead><tr>${[
    t.common.year,
    t.roi.income,
    t.roi.operatingCosts,
    t.roi.mortgagePayments,
    t.roi.netCashFlow,
    t.roi.cumulativeCashFlow,
    t.roi.equity,
  ]
    .map((h, i) => `<th style="${head}${i === 0 ? ";text-align:left" : ""}">${esc(h)}</th>`)
    .join("")}</tr></thead><tbody>${r.years
    .map(
      (y) =>
        `<tr><td style="${cell};text-align:left">${y.year}</td><td style="${cell}">${money(y.income)}</td><td style="${cell}">${money(y.operatingCosts)}</td><td style="${cell}">${money(y.mortgagePayments)}</td><td style="${cell}">${money(y.netCashFlow)}</td><td style="${cell}">${money(y.cumulativeCashFlow)}</td><td style="${cell}">${money(y.equity)}</td></tr>`,
    )
    .join("")}</tbody></table>
<h2>${esc(t.pdf.assumptions)}</h2>
<ul>${roiAssumptions(d.calc)
    .map((a) => `<li>${esc(a)}</li>`)
    .join("")}</ul>
<p class="muted" style="margin-top:16px">${esc(t.pdf.disclaimer)}</p>
<p class="muted">${esc(
    d.brand.phone ? format(t.pdf.contact, { phone: d.brand.phone }) : t.pdf.contactNoPhone,
  )} ${esc(d.brand.agencyName)}${d.brand.licenceNumber ? ` · ${esc(d.brand.licenceNumber)}` : ""}</p>
</body></html>`;
}

export const roiReportJob = defineJob({
  name: "tools.roi_report",
  payload: z.object({
    reportId: z.uuid(),
    leadId: z.uuid(),
    email: z.email(),
    name: z.string().max(80),
    calculation: roiCalculationSchema,
  }),
  maxAttempts: 4,
  async run({ reportId, leadId, email, name, calculation }, { db, log }) {
    if (await alreadySent(db, reportId)) return { skipped: "sent" };
    const [market, general] = [await loadSettings("market", db), await loadSettings("general", db)];
    const brand = await loadEmailBrand(db);
    const result = rentalReturns(roiInputOf(calculation));
    const date = new Intl.DateTimeFormat("en", {
      dateStyle: "long",
      timeZone: general.timeZone,
    }).format(new Date());
    const html = reportHtml({
      calc: calculation,
      result,
      brand,
      currency: market.baseCurrency,
      areaUnit: market.areaUnit,
      name,
      date,
    });
    // Same key on a retry: the file is simply replaced.
    const pdf = await renderPdf(html);
    await (await getStorage()).put(reportKey(reportId), pdf, "application/pdf");
    const link = await reportLink(reportId);

    const [lead] = await db
      .select({ agent: agents.name, active: agents.isActive })
      .from(leads)
      .leftJoin(agents, eq(agents.id, leads.agentId))
      .where(eq(leads.id, leadId));
    const agent = lead?.active && lead.agent ? lead.agent.split(/\s+/)[0]! : general.agencyName;
    const message = await renderTemplateEmail(
      db,
      "tools.roi_report",
      {
        name: name.split(/\s+/)[0] || null,
        agency: general.agencyName,
        agent,
        summary: roiSummary(result, (v) => formatMoney(v, market.baseCurrency)),
        days: REPORT_LINK_DAYS,
        url: link,
      },
      link,
    );
    if (!message) {
      log("roi report template is turned off", { reportId });
      return { skipped: "template off" };
    }
    const emailId = await queueEmail(
      {
        to: email,
        subject: message.subject,
        template: "tools.roi_report",
        html: message.html,
        text: message.text,
        related: { type: "roi_report", id: reportId },
      },
      db,
    );
    log("roi report sent", { leadId, emailId, bytes: pdf.length });
    return { emailId, bytes: pdf.length };
  },
});

async function alreadySent(db: DbOrTx, reportId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(and(eq(emailLog.relatedType, "roi_report"), eq(emailLog.relatedId, reportId)))
    .limit(1);
  return Boolean(row);
}
