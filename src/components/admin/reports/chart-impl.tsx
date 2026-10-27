"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReportChart } from "@/features/reports/types";

/**
 * Recharts drawing of a report chart (01 §2 "Charts (admin): Recharts"). Loaded lazily by
 * `report-chart.tsx`, so Recharts only ever reaches admin report pages. Colours are theme
 * tokens: the accent for the main series, muted ink for a second one.
 */
const seriesColors = ["var(--color-accent)", "var(--color-text-muted)"];
const axis = { fontSize: 11, fill: "var(--color-text-muted)" };
const ints = new Intl.NumberFormat("en");

function shortDate(x: string): string {
  // "2026-10-24" -> "24 Oct"; other labels as they are.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x)) return x;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${x}T00:00:00Z`));
}

export default function ChartImpl({ chart }: { chart: ReportChart }) {
  const tooltip = (
    <Tooltip
      cursor={{ fill: "var(--color-surface-muted)", opacity: 0.6 }}
      contentStyle={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        fontSize: 12,
        color: "var(--color-ink)",
      }}
      labelFormatter={(label) => shortDate(String(label))}
      formatter={(value) => ints.format(Number(value))}
    />
  );
  const legend = chart.series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null;
  const grid = <CartesianGrid stroke="var(--color-border)" vertical={false} />;

  if (chart.kind === "hbar") {
    const height = Math.max(160, chart.data.length * 30 + 40);
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chart.data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid stroke="var(--color-border)" horizontal={false} />
          <XAxis type="number" tick={axis} allowDecimals={false} />
          <YAxis type="category" dataKey="x" tick={axis} width={140} interval={0} />
          {tooltip}
          {legend}
          {chart.series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={seriesColors[i % seriesColors.length]}
              radius={[0, 4, 4, 0]}
              maxBarSize={22}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if (chart.kind === "line") {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chart.data} margin={{ left: 0, right: 16, top: 8 }}>
          {grid}
          <XAxis dataKey="x" tick={axis} tickFormatter={shortDate} minTickGap={24} />
          <YAxis tick={axis} allowDecimals={false} width={36} />
          {tooltip}
          {legend}
          {chart.series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={seriesColors[i % seriesColors.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chart.data} margin={{ left: 0, right: 16, top: 8 }} barGap={2}>
        {grid}
        <XAxis dataKey="x" tick={axis} tickFormatter={shortDate} minTickGap={8} />
        <YAxis tick={axis} allowDecimals={false} width={36} />
        {tooltip}
        {legend}
        {chart.series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={seriesColors[i % seriesColors.length]}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
