"use client";

import dynamic from "next/dynamic";
import type { ReportChart as Chart } from "@/features/reports/types";

// Recharts is loaded only when a chart is on screen, in its own chunk (admin pages only).
const ChartImpl = dynamic(() => import("./chart-impl"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse rounded-md bg-surface-muted" />,
});

/**
 * A report chart. The same numbers are always in a table on the page, so the drawing is
 * hidden from screen readers and the figure points to the table.
 */
export function ReportChart({ chart, tableNote }: { chart: Chart; tableNote: string }) {
  const height = chart.kind === "hbar" ? Math.max(160, chart.data.length * 30 + 40) : 240;
  return (
    <figure className="rounded-lg border border-border bg-surface p-4">
      <figcaption className="mb-3 text-[13.5px] font-semibold text-ink">
        {chart.title}
        <span className="sr-only"> {tableNote}</span>
      </figcaption>
      <div aria-hidden style={{ height }}>
        <ChartImpl chart={chart} />
      </div>
    </figure>
  );
}
