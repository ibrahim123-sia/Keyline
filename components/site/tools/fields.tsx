"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "cn";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * A labelled number box for the calculators, with an optional slider under it (11 §1 "down
 * payment … slider"). The box keeps what is being typed (an empty box, "4.") and reports
 * numbers within min–max; leaving it puts the clamped number back.
 */
export function CalcNumber({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  help,
  slider,
  sliderLabel,
  disabled,
  className,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: ReactNode;
  help?: ReactNode;
  slider?: boolean;
  /** The slider's own name for screen readers (the box has the label). */
  sliderLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const [text, setText] = useState(() => String(value));
  const [shown, setShown] = useState(value);
  // Outside changes (the slider, a mode switch) replace the text unless it already means that.
  if (shown !== value) {
    setShown(value);
    if (!(Number(text) === value && text.trim() !== "")) setText(String(value));
  }
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[14px] font-semibold text-ink">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={text}
          disabled={disabled}
          aria-describedby={helpId}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(clamp(n, min, max));
          }}
          onBlur={() => {
            const n = Number(text);
            const next = text.trim() === "" || !Number.isFinite(n) ? min : clamp(n, min, max);
            setText(String(next));
            if (next !== value) onChange(next);
          }}
          className="h-11 w-full min-w-0 rounded-input border border-input bg-surface px-3 text-[15px] text-ink tabular disabled:opacity-60"
        />
        {suffix && <span className="shrink-0 text-[13.5px] text-text-muted">{suffix}</span>}
      </div>
      {slider && (
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={clamp(value, min, max)}
          disabled={disabled}
          aria-label={sliderLabel ?? label}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-[var(--color-accent)]"
        />
      )}
      {help && (
        <p id={helpId} className="text-[13px] text-text-muted">
          {help}
        </p>
      )}
    </div>
  );
}

/** Money typed in major units (as shown), kept in minor units (as stored). */
export function CalcMoney({
  value,
  onChange,
  decimals,
  max,
  currencyCode,
  ...rest
}: {
  label: string;
  value: number;
  onChange: (minor: number) => void;
  decimals: number;
  max: number;
  currencyCode: string;
  help?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const f = 10 ** decimals;
  return (
    <CalcNumber
      {...rest}
      value={value / f}
      onChange={(major) => onChange(Math.round(major * f))}
      min={0}
      max={max}
      step={1}
      suffix={currencyCode}
    />
  );
}

/** A small "card" for one result figure. */
export function ResultTile({
  label,
  value,
  help,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  help?: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-[16px] p-4",
        emphasis ? "bg-ink text-surface" : "bg-surface shadow-soft",
      )}
    >
      <dt className={cn("text-meta", emphasis ? "text-surface/80" : "text-text-muted")}>{label}</dt>
      <dd
        className={cn(
          "font-bold tabular",
          emphasis ? "text-[30px] leading-tight" : "text-[22px] text-ink",
        )}
      >
        {value}
      </dd>
      {help && (
        <dd className={cn("text-[13px]", emphasis ? "text-surface/80" : "text-text-muted")}>
          {help}
        </dd>
      )}
    </div>
  );
}
