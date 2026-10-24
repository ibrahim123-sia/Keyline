"use client";

import { InfoIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  minDownPct,
  mortgageRanges,
  roiInputOf,
  roiRanges,
  roiSearch,
  MAX_PRICE_MAJOR,
  MAX_SIZE,
  type MortgageDefaults,
  type RoiDefaultsSettings,
  type RoiState,
} from "@/features/tools/calculator-params";
import { BREAK_EVEN_HORIZON_YEARS, rentalReturns } from "@/features/tools/math";
import { formatPct, roiAssumptions } from "@/features/tools/roi-text";
import { format } from "@/lib/i18n";
import { calculators as c } from "@/lib/i18n/dictionaries/calculators";
import { formatMoney, type CurrencyFormat } from "@/lib/money";
import { areaUnitLabels, type AreaUnit } from "@/lib/units";
import { LineChart } from "./charts";
import { CalcMoney, CalcNumber, ResultTile } from "./fields";
import { ShareLink, useCalculatorUrl } from "./share-link";

const t = c.roi;
const PATH = "/tools/rental-returns";

const ReportForm = dynamic(() => import("./roi-report-form").then((m) => m.RoiReportForm), {
  ssr: false,
});

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-[20px] bg-surface p-5 shadow-soft sm:p-6">
      <legend className="float-start mb-1 text-[17px] font-semibold text-ink">{title}</legend>
      {children}
    </fieldset>
  );
}

/** The rental return simulator (11 §2): inputs, results, the 10-year chart and the report. */
export function RoiSimulator({
  initial,
  roiDefaults,
  mortgageDefaults,
  currency,
  areaUnit,
}: {
  initial: RoiState;
  roiDefaults: RoiDefaultsSettings;
  mortgageDefaults: MortgageDefaults;
  currency: CurrencyFormat;
  areaUnit: AreaUnit;
}) {
  const [s, setS] = useState(initial);
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<RoiState>) => setS((prev) => ({ ...prev, ...patch }));
  const money = (minor: number) => formatMoney(minor, currency);
  const r = useMemo(() => rentalReturns(roiInputOf(s)), [s]);
  const search = roiSearch(s, currency.decimals);
  useCalculatorUrl(PATH, search, "rental_returns");
  const ranges = roiRanges(roiDefaults);
  const unit = areaUnitLabels[areaUnit];
  const f = 10 ** currency.decimals;
  const moneyProps = { decimals: currency.decimals, currencyCode: currency.code };
  const needsRates = s.mode === "short" && s.nightlyHigh === 0 && s.nightlyLow === 0;
  const ready = s.price > 0 && !needsRates;
  const y5 = r.years[4]!;
  const y10 = r.years[9]!;

  return (
    <div className="flex flex-col gap-10">
      {s.ref && (
        <p className="flex items-center gap-2 text-[14px] text-text-muted">
          <InfoIcon className="size-4 text-accent" aria-hidden />
          {format(c.common.fromListing, { ref: s.ref })}
        </p>
      )}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="roi-inputs" className="flex flex-col gap-5">
          <h2 id="roi-inputs" className="text-h3 text-ink">
            {t.numbers}
          </h2>
          <Panel title={t.rentPanel}>
            <div className="grid gap-4 sm:grid-cols-2">
              <CalcMoney
                label={t.price}
                value={s.price}
                max={MAX_PRICE_MAJOR}
                onChange={(price) => set({ price })}
                {...moneyProps}
              />
              <CalcNumber
                label={t.purchaseCosts}
                value={s.purchaseCostsPct}
                onChange={(purchaseCostsPct) => set({ purchaseCostsPct })}
                min={0}
                max={20}
                step={0.1}
                suffix={c.common.pctOfPrice}
                help={t.purchaseCostsHelp}
              />
            </div>
            <div role="radiogroup" aria-label={t.letting} className="flex flex-col gap-2">
              <span aria-hidden className="text-[14px] font-semibold text-ink">
                {t.letting}
              </span>
              <div className="flex flex-wrap gap-2">
                {(["long", "short"] as const).map((mode) => (
                  <label
                    key={mode}
                    className="cursor-pointer rounded-full border border-input px-4 py-2 text-[14px] font-semibold text-text has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-surface has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                  >
                    <input
                      type="radio"
                      name="roi-mode"
                      className="sr-only"
                      checked={s.mode === mode}
                      onChange={() => set({ mode })}
                    />
                    {mode === "long" ? t.long : t.short}
                  </label>
                ))}
              </div>
            </div>
            {s.mode === "long" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <CalcMoney
                  label={t.rent}
                  value={s.rentYearly}
                  max={MAX_PRICE_MAJOR}
                  onChange={(rentYearly) => set({ rentYearly })}
                  {...moneyProps}
                />
                <CalcNumber
                  label={t.vacancy}
                  value={s.vacancyPct}
                  onChange={(vacancyPct) => set({ vacancyPct })}
                  min={0}
                  max={50}
                  step={0.5}
                  suffix={c.common.percent}
                  help={t.vacancyHelp}
                />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <CalcMoney
                  label={t.nightlyHigh}
                  value={s.nightlyHigh}
                  max={MAX_PRICE_MAJOR}
                  onChange={(nightlyHigh) => set({ nightlyHigh })}
                  {...moneyProps}
                />
                <CalcMoney
                  label={t.nightlyLow}
                  value={s.nightlyLow}
                  max={MAX_PRICE_MAJOR}
                  onChange={(nightlyLow) => set({ nightlyLow })}
                  {...moneyProps}
                />
                <CalcNumber
                  label={t.highSeason}
                  value={s.highSeasonMonths}
                  onChange={(v) => set({ highSeasonMonths: Math.round(v) })}
                  min={0}
                  max={12}
                  suffix={t.highSeasonUnit}
                />
                <CalcNumber
                  label={t.occupancy}
                  value={s.occupancyPct}
                  onChange={(occupancyPct) => set({ occupancyPct })}
                  min={ranges.occupancyPct.min}
                  max={ranges.occupancyPct.max}
                  suffix={c.common.percent}
                  slider
                  help={t.occupancyHelp}
                />
                <CalcNumber
                  label={t.management}
                  value={s.managementFeePct}
                  onChange={(managementFeePct) => set({ managementFeePct })}
                  min={ranges.managementFeePct.min}
                  max={ranges.managementFeePct.max}
                  suffix={c.common.percent}
                  slider
                  help={t.managementHelp}
                  className="sm:col-span-2"
                />
              </div>
            )}
          </Panel>
          <Panel title={t.costs}>
            <div className="grid gap-4 sm:grid-cols-2">
              <CalcMoney
                label={format(t.serviceCharge, { unit })}
                value={s.serviceChargePerArea}
                max={1_000_000}
                onChange={(serviceChargePerArea) => set({ serviceChargePerArea })}
                {...moneyProps}
              />
              <CalcNumber
                label={t.size}
                value={s.size}
                onChange={(size) => set({ size })}
                min={0}
                max={MAX_SIZE}
                suffix={unit}
                help={money(Math.round(s.serviceChargePerArea * s.size))}
              />
              <CalcNumber
                label={t.maintenance}
                value={s.maintenancePct}
                onChange={(maintenancePct) => set({ maintenancePct })}
                min={0}
                max={20}
                step={0.1}
                suffix={c.common.pctPerYear}
                help={t.maintenanceHelp}
              />
            </div>
          </Panel>
          <Panel title={t.financing}>
            <label className="flex items-center justify-between gap-3 text-[14.5px] text-ink">
              <span className="flex flex-col">
                <span className="font-semibold">{t.mortgage}</span>
                <span className="text-[13px] text-text-muted">{t.mortgageHelp}</span>
              </span>
              <Switch
                checked={s.mortgageOn}
                onCheckedChange={(mortgageOn) => set({ mortgageOn })}
                aria-label={t.mortgage}
              />
            </label>
            {s.mortgageOn && (
              <div className="grid gap-4 sm:grid-cols-3">
                <CalcNumber
                  label={t.downPayment}
                  value={s.downPct}
                  onChange={(downPct) => set({ downPct })}
                  min={minDownPct(mortgageDefaults)}
                  max={100}
                  suffix={c.common.percent}
                  help={money(Math.round((s.price * s.downPct) / 100))}
                />
                <CalcNumber
                  label={t.rate}
                  value={s.ratePct}
                  onChange={(ratePct) => set({ ratePct })}
                  min={0}
                  max={mortgageRanges.ratePct.max}
                  step={0.05}
                  suffix={c.common.pctPerYear}
                />
                <CalcNumber
                  label={t.years}
                  value={s.years}
                  onChange={(years) => set({ years: Math.round(years) })}
                  min={1}
                  max={mortgageDefaults.maxYears}
                  suffix={c.common.years}
                />
              </div>
            )}
          </Panel>
          <Panel title={t.growth}>
            <div className="grid gap-4 sm:grid-cols-2">
              <CalcNumber
                label={t.rentGrowth}
                value={s.rentGrowthPct}
                onChange={(rentGrowthPct) => set({ rentGrowthPct })}
                min={ranges.growthPct.min}
                max={ranges.growthPct.max}
                step={0.1}
                suffix={c.common.pctPerYear}
              />
              <CalcNumber
                label={t.priceGrowth}
                value={s.priceGrowthPct}
                onChange={(priceGrowthPct) => set({ priceGrowthPct })}
                min={ranges.growthPct.min}
                max={ranges.growthPct.max}
                step={0.1}
                suffix={c.common.pctPerYear}
              />
            </div>
          </Panel>
        </section>

        <section
          aria-labelledby="roi-results"
          className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start"
        >
          <h2 id="roi-results" className="text-h3 text-ink">
            {t.results}
          </h2>
          {!ready ? (
            <p className="text-[15px] text-text-muted">
              {needsRates ? t.shortNeedsRates : c.mortgage.noPrice}
            </p>
          ) : (
            <dl aria-live="polite" className="grid gap-3 sm:grid-cols-2">
              <ResultTile
                label={t.grossYield}
                value={`${formatPct(r.grossYieldPct)}%`}
                help={t.grossYieldHelp}
              />
              <ResultTile
                label={t.netYield}
                value={`${formatPct(r.netYieldPct)}%`}
                help={t.netYieldHelp}
              />
              <div className="sm:col-span-2">
                <ResultTile
                  emphasis
                  label={t.cashFlow}
                  value={`${money(r.netCashFlowYear1)} ${c.common.perYear}`}
                  help={format(t.cashFlowHelp, {
                    mortgage: s.mortgageOn ? t.cashFlowMortgage : "",
                    monthly: money(Math.round(r.netCashFlowYear1 / 12)),
                  })}
                />
              </div>
              <ResultTile
                label={t.irr}
                value={r.irrPct === null ? t.irrNone : `${formatPct(r.irrPct)}%`}
                help={t.irrHelp}
              />
              <ResultTile
                label={t.breakEven}
                value={
                  r.breakEvenYear === null
                    ? format(t.breakEvenNever, { n: BREAK_EVEN_HORIZON_YEARS })
                    : format(c.common.yearN, { n: r.breakEvenYear })
                }
                help={t.breakEvenHelp}
              />
            </dl>
          )}
          {ready && (
            <p className="text-[14px] text-text">
              {format(t.cashInvested, { amount: money(r.cashInvested) })}
            </p>
          )}
          <p className="flex items-start gap-2 rounded-[16px] bg-accent-soft px-4 py-3 text-[14px] text-ink">
            <InfoIcon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            {c.common.estimate}
          </p>
          <div className="flex flex-wrap items-start gap-3">
            <Button type="button" size="md" disabled={!ready} onClick={() => setOpen(true)}>
              {t.report.cta}
            </Button>
            <ShareLink path={PATH} search={search} />
          </div>
        </section>
      </div>

      {ready && (
        <>
          <section aria-labelledby="roi-summary" className="flex flex-col gap-4">
            <h2 id="roi-summary" className="text-h3 text-ink">
              {t.summaryTitle}
            </h2>
            <div className="overflow-x-auto rounded-[20px] bg-surface p-4 shadow-soft sm:p-6">
              <table className="w-full min-w-[22rem] text-[15px] tabular">
                <thead>
                  <tr className="text-text-muted">
                    <td />
                    <th scope="col" className="py-2 text-end font-semibold">
                      {t.after5}
                    </th>
                    <th scope="col" className="py-2 text-end font-semibold">
                      {t.after10}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <th scope="row" className="py-2 text-start font-medium text-ink">
                      {t.cumulativeCashFlow}
                    </th>
                    <td className="py-2 text-end">{money(y5.cumulativeCashFlow)}</td>
                    <td className="py-2 text-end">{money(y10.cumulativeCashFlow)}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-2 text-start font-medium text-ink">
                      {t.equity}
                      <span className="block text-[13px] font-normal text-text-muted">
                        {t.equityHelp}
                      </span>
                    </th>
                    <td className="py-2 text-end">{money(y5.equity)}</td>
                    <td className="py-2 text-end">{money(y10.equity)}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="py-2 text-start font-semibold text-ink">
                      {t.totalReturn}
                    </th>
                    {[y5, y10].map((y) => (
                      <td key={y.year} className="py-2 text-end font-semibold text-ink">
                        {money(y.totalReturn)}
                        {r.cashInvested > 0 && (
                          <span className="block text-[13px] font-normal text-text-muted">
                            {format(t.totalReturnPct, {
                              pct: formatPct((y.totalReturn / r.cashInvested) * 100),
                            })}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="roi-chart" className="flex flex-col gap-4">
            <h2 id="roi-chart" className="text-h3 text-ink">
              {t.chartTitle}
            </h2>
            <div className="rounded-[20px] bg-surface p-4 shadow-soft sm:p-6">
              <LineChart
                labels={r.years.map((y) => String(y.year))}
                series={[
                  { name: t.equity, color: "var(--color-ink)" },
                  { name: t.cumulativeCashFlow, color: "var(--color-accent)" },
                ]}
                values={[
                  r.years.map((y) => y.equity / f),
                  r.years.map((y) => y.cumulativeCashFlow / f),
                ]}
                description={format(t.chartLabel, {
                  equity: money(y10.equity),
                  cash: money(y10.cumulativeCashFlow),
                })}
                formatValue={(v) => money(Math.round(v * f))}
                tooltipTitle={(i) => format(c.common.yearN, { n: i + 1 })}
              />
            </div>
            <details className="rounded-[16px] border border-border bg-surface">
              <summary className="cursor-pointer px-4 py-3 text-[14.5px] font-semibold text-ink">
                {t.yearByYear}
              </summary>
              <div className="overflow-x-auto px-4 pb-4">
                <table className="w-full min-w-[40rem] text-[14px] tabular">
                  <caption className="sr-only">{t.yearByYear}</caption>
                  <thead>
                    <tr className="text-text-muted">
                      {[
                        c.common.year,
                        t.income,
                        t.operatingCosts,
                        t.mortgagePayments,
                        t.netCashFlow,
                        t.cumulativeCashFlow,
                        t.equity,
                      ].map((h, i) => (
                        <th
                          key={h}
                          scope="col"
                          className={
                            i === 0
                              ? "py-2 text-start font-semibold"
                              : "py-2 text-end font-semibold"
                          }
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {r.years.map((y) => (
                      <tr key={y.year}>
                        <th scope="row" className="py-1.5 text-start font-medium text-ink">
                          {y.year}
                        </th>
                        <td className="py-1.5 text-end">{money(y.income)}</td>
                        <td className="py-1.5 text-end">{money(y.operatingCosts)}</td>
                        <td className="py-1.5 text-end">{money(y.mortgagePayments)}</td>
                        <td className="py-1.5 text-end">{money(y.netCashFlow)}</td>
                        <td className="py-1.5 text-end">{money(y.cumulativeCashFlow)}</td>
                        <td className="py-1.5 text-end">{money(y.equity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </>
      )}

      <section
        aria-labelledby="roi-assumptions"
        className="flex flex-col gap-3 rounded-[20px] bg-surface-muted p-5 sm:p-6"
      >
        <h2 id="roi-assumptions" className="text-[20px] font-semibold text-ink">
          {t.assumptions}
        </h2>
        <ul className="list-disc ps-5 text-[14.5px] text-text marker:text-accent">
          {roiAssumptions(s).map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.report.title}</DialogTitle>
            <DialogDescription>{t.report.intro}</DialogDescription>
          </DialogHeader>
          {open && <ReportForm calculation={s} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
