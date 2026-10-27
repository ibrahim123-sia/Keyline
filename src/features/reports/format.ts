import { formatMoney, toMajor, type CurrencyFormat } from "@/lib/money";
import { formatDuration } from "@/lib/units";
import type { CsvValue } from "@/lib/csv";
import type { CellValue, ValueFormat } from "./types";
import type { Change } from "./period";

/** Display and CSV formatting of report values. Runs on the server and in the browser. */

const ints = new Intl.NumberFormat("en");
const pct = new Intl.NumberFormat("en", { style: "percent", maximumFractionDigits: 1 });

export function formatValue(
  value: CellValue,
  format: ValueFormat,
  currency: CurrencyFormat,
): string {
  if (value === null || value === undefined || value === "") return "–";
  if (typeof value === "string") return value;
  switch (format) {
    case "int":
      return ints.format(value);
    case "money":
      return formatMoney(Math.round(value), currency);
    case "percent":
      return pct.format(value);
    case "duration":
      return formatDuration(value);
    case "days":
      return `${ints.format(value)} ${value === 1 ? "day" : "days"}`;
    case "text":
      return String(value);
  }
}

/** Plain numbers for spreadsheets: money in major units, percent as 12.5, time in minutes. */
export function csvValue(
  value: CellValue,
  format: ValueFormat,
  currency: CurrencyFormat,
): CsvValue {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  switch (format) {
    case "money":
      return toMajor(Math.round(value), currency.decimals).toFixed(currency.decimals);
    case "percent":
      return Math.round(value * 1000) / 10;
    case "duration":
      return Math.round(value / 6) / 10;
    default:
      return value;
  }
}

/** Header suffix in CSV files so the plain numbers keep their unit. */
export function csvUnit(format: ValueFormat, currency: CurrencyFormat): string {
  switch (format) {
    case "money":
      return ` (${currency.code})`;
    case "percent":
      return " (%)";
    case "duration":
      return " (minutes)";
    case "days":
      return " (days)";
    default:
      return "";
  }
}

/** "+12%", "-3", "no change", "new" (from zero). */
export function formatChange(
  change: Change,
  format: ValueFormat,
  currency: CurrencyFormat,
): string {
  if (change.direction === "same") return "no change";
  if (change.ratio === null) return "new";
  if (format === "percent") {
    const points = Math.round(change.delta * 1000) / 10;
    return `${points > 0 ? "+" : ""}${points} pts`;
  }
  if (format === "duration" || format === "money") {
    const sign = change.delta > 0 ? "+" : "-";
    return `${sign}${formatValue(Math.abs(change.delta), format, currency)}`;
  }
  const p = Math.round(change.ratio * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
}
