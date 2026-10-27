"use client";

import { useRef, type ReactNode } from "react";
import { periodPresets, type PeriodPreset } from "@/features/reports/period";
import { reports as t } from "@/lib/i18n/dictionaries/reports";

export const reportControl =
  "h-9 rounded-input border border-input bg-surface px-2.5 text-[13.5px] text-ink";
export const reportLabel = "flex flex-col gap-1 text-[12.5px] font-semibold text-ink";

/**
 * The period filter (a plain GET form, so it works before JavaScript and every view has its
 * own URL). Typing a date switches the preset to "Custom dates".
 */
export function PeriodForm({
  action,
  preset,
  from,
  to,
  presets = periodPresets,
  children,
}: {
  action: string;
  preset: PeriodPreset;
  from: string;
  to: string;
  presets?: readonly PeriodPreset[];
  /** The report's own controls (dimension, thresholds), inside the same form. */
  children?: ReactNode;
}) {
  const select = useRef<HTMLSelectElement>(null);
  const toCustom = () => {
    if (select.current) select.current.value = "custom";
  };
  return (
    <form
      method="get"
      action={action}
      aria-label={t.period.label}
      className="flex flex-wrap items-end gap-3"
    >
      <label className={reportLabel}>
        {t.period.label}
        <select ref={select} name="period" defaultValue={preset} className={reportControl}>
          {presets.map((p) => (
            <option key={p} value={p}>
              {t.period.presets[p]}
            </option>
          ))}
        </select>
      </label>
      <label className={reportLabel}>
        {t.period.from}
        <input
          type="date"
          name="from"
          defaultValue={from}
          onChange={toCustom}
          className={reportControl}
        />
      </label>
      <label className={reportLabel}>
        {t.period.to}
        <input
          type="date"
          name="to"
          defaultValue={to}
          onChange={toCustom}
          className={reportControl}
        />
      </label>
      {children}
      <button
        type="submit"
        className="h-9 rounded-button bg-ink px-4 text-[13.5px] font-semibold text-surface"
      >
        {t.period.show}
      </button>
    </form>
  );
}
