import type { Change, Period } from "./period";

/**
 * The shape every report is computed into. The admin page, the CSV and the PDF all render the
 * same data, so an export always matches what is on screen.
 */
export const reportKeys = [
  "overview",
  "sources",
  "funnel",
  "response-time",
  "listings",
  "agents",
  "ai",
] as const;
export type ReportKey = (typeof reportKeys)[number];

/**
 * How a value is shown: money in minor units of the base currency, percent as a share (0..1),
 * duration in seconds; null shows as a dash.
 */
export type ValueFormat = "text" | "int" | "money" | "percent" | "duration" | "days";

export type CellValue = string | number | null;

export type ReportColumn = {
  key: string;
  label: string;
  format: ValueFormat;
};

export type ReportRow = {
  key: string;
  cells: Record<string, CellValue>;
  /** Where the row's first cell links to in the admin (a listing, the agent's leads). */
  href?: string;
  /** Per-cell formats that override the column's (a table of mixed metrics). */
  formats?: Record<string, ValueFormat>;
};

export type ReportTable = {
  id: string;
  title: string;
  description?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  total?: ReportRow;
  /** Shown when there are no rows. */
  empty: string;
};

export type Kpi = {
  key: string;
  label: string;
  format: ValueFormat;
  value: number | null;
  /** Null for live counts that have no previous period (e.g. unanswered right now). */
  previous: number | null;
  change: Change | null;
  /** Whether a rise is good news (response time: lower is better). */
  higherIsBetter: boolean;
  hint?: string;
  href?: string;
};

export type ChartSeries = { key: string; label: string };

export type ReportChart = {
  id: string;
  title: string;
  kind: "bar" | "line" | "hbar";
  /** One object per point: `x` is the category or date label, series keys hold numbers. */
  data: Array<Record<string, string | number>>;
  series: ChartSeries[];
  format: ValueFormat;
};

export type ReportData = {
  key: ReportKey;
  title: string;
  period: Period;
  kpis: Kpi[];
  charts: ReportChart[];
  tables: ReportTable[];
  /** How the numbers are counted, shown under the report and in the PDF. */
  notes: string[];
  /** A report that cannot be computed yet (AI before it is set up). */
  emptyState?: { title: string; description: string };
};

export type ReportContext = {
  period: Period;
  timeZone: string;
  /** The agency's local date today. */
  today: string;
  now: Date;
  currency: { code: string; symbol: string; symbolPosition: "before" | "after"; decimals: number };
};
