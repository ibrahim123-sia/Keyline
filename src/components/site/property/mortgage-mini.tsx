"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { useId, useState } from "react";
import { monthlyPayment } from "@/features/tools/math";
import { displayPrice, type Rates } from "@/lib/currency-display";
import { format } from "@/lib/i18n";
import { property as t } from "@/lib/i18n/dictionaries/property";

function Field({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
          className="h-10 w-full rounded-input border border-input bg-surface px-3 text-[15px] tabular"
        />
        <span className="text-[13px] text-text-muted">{suffix}</span>
      </div>
    </div>
  );
}

/**
 * Monthly payment mini calculator (06 §5.11) with the market's mortgage defaults and the tools'
 * maths; "Open the mortgage calculator" carries the price and what was typed here.
 */
export function MortgageMini({
  price,
  currency,
  visitorCurrency,
  rates,
  defaults,
  calculatorHref,
}: {
  /** /tools/mortgage with this listing's price (base currency) and reference. */
  calculatorHref: string | null;
  price: number;
  currency: string;
  visitorCurrency: string;
  rates: Rates;
  defaults: { downPaymentPct: number; interestRatePct: number; years: number };
}) {
  const [down, setDown] = useState(defaults.downPaymentPct);
  const [rate, setRate] = useState(defaults.interestRatePct);
  const [years, setYears] = useState(defaults.years);
  const loan = Math.round(price * (1 - down / 100));
  const monthly = monthlyPayment(loan, rate, years);
  return (
    <div className="flex flex-col gap-4 rounded-[20px] bg-surface p-5 shadow-soft">
      <p className="text-[14px] text-text-muted">
        {format(t.mortgage.intro, { down, years, rate })}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label={t.mortgage.downPayment}
          value={down}
          onChange={setDown}
          min={0}
          max={100}
          step={1}
          suffix="%"
        />
        <Field
          label={t.mortgage.rate}
          value={rate}
          onChange={setRate}
          min={0}
          max={30}
          step={0.1}
          suffix="%"
        />
        <Field
          label={t.mortgage.years}
          value={years}
          onChange={setYears}
          min={1}
          max={40}
          step={1}
          suffix=""
        />
      </div>
      <p className="text-[22px] font-bold text-ink tabular" aria-live="polite">
        {format(t.mortgage.result, {
          amount: displayPrice(monthly, currency, visitorCurrency, rates).text,
        })}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-text-muted">
        <span>{t.mortgage.disclaimer}</span>
        <Link
          href={
            calculatorHref
              ? `${calculatorHref}&${new URLSearchParams({ down: String(down), rate: String(rate), years: String(years) })}`
              : "/tools/mortgage"
          }
          prefetch={false}
          className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
        >
          {t.mortgage.fullCalculator}{" "}
          <ArrowRightIcon className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
