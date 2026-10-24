import { format } from "@/lib/i18n";
import { calculators as t } from "@/lib/i18n/dictionaries/calculators";
import type { RoiState } from "./calculator-params";
import { roundTo, type RoiResult } from "./math";

/**
 * The simulator's words that the page, the PDF report and the lead share, so all three say
 * the same thing. Client-safe.
 */

const pct = (v: number) => String(roundTo(v, 1));

/** The plain-language assumptions box (11 §2). */
export function roiAssumptions(s: RoiState): string[] {
  const a = t.roi.assumptionList;
  return [
    format(a.rentGrowth, { pct: pct(s.rentGrowthPct) }),
    format(a.priceGrowth, { pct: pct(s.priceGrowthPct) }),
    format(a.maintenance, { pct: pct(s.maintenancePct) }),
    s.mode === "long"
      ? format(a.vacancy, { pct: pct(s.vacancyPct) })
      : format(a.short, {
          occupancy: pct(s.occupancyPct),
          months: s.highSeasonMonths,
          fee: pct(s.managementFeePct),
        }),
    format(a.purchaseCosts, { pct: pct(s.purchaseCostsPct) }),
    s.mortgageOn
      ? format(a.mortgage, { down: pct(s.downPct), rate: pct(s.ratePct), years: s.years })
      : a.cash,
    a.sale,
    a.tax,
  ];
}

/** One line for the email and the lead: "Gross yield 7% · Net yield 4.7% · …". */
export function roiSummary(r: RoiResult, money: (minor: number) => string): string {
  return format(t.email.summary, {
    gross: pct(r.grossYieldPct),
    net: pct(r.netYieldPct),
    cash: money(r.netCashFlowYear1),
    irr: r.irrPct === null ? t.email.noIrr : format(t.email.irr, { pct: pct(r.irrPct) }),
  });
}

export const formatPct = pct;
