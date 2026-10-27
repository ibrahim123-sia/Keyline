"use client";

import { useId, useState, type PointerEvent } from "react";

/**
 * Small inline SVG charts for the calculators (no chart library on the public site). Each has
 * a text summary for screen readers (role="img"), a legend, a hover read-out, and the calling
 * page shows the same numbers as a table. Colours are the branding tokens.
 */

export type Series = { name: string; color: string };

const W = 640;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 30, left: 64 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** Rounded tick values covering [min, max] (always including 0). */
function ticks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (hi === lo) return [0];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.999; v += step)
    out.push(Math.round(v / step) * step);
  return out;
}

function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] text-text">
      {series.map((s) => (
        <li key={s.name} className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block size-3 rounded-[3px]"
            style={{ background: s.color }}
          />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({
  xPct,
  title,
  rows,
}: {
  xPct: number;
  title: string;
  rows: Array<{ name: string; color: string; value: string }>;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-[12px] bg-surface px-3 py-2 text-[13px] shadow-soft ring-1 ring-border"
      style={
        xPct > 55 ? { insetInlineEnd: `${100 - xPct + 2}%` } : { insetInlineStart: `${xPct + 2}%` }
      }
    >
      <p className="font-semibold text-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.name} className="flex items-center justify-between gap-3 text-text">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-full"
              style={{ background: r.color }}
            />
            {r.name}
          </span>
          <span className="font-semibold text-ink tabular">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

function useHover(count: number) {
  const [index, setIndex] = useState<number | null>(null);
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W - PAD.left;
    const i = Math.floor((x / PLOT_W) * count);
    setIndex(i >= 0 && i < count ? i : null);
  };
  return { index, onPointerMove, onPointerLeave: () => setIndex(null) };
}

function YAxis({ values, y }: { values: number[]; y: (v: number) => number }) {
  return (
    <g>
      {values.map((v) => (
        <g key={v}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--color-border)"
            strokeWidth={v === 0 ? 1.5 : 1}
          />
          <text
            x={PAD.left - 8}
            y={y(v)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="12"
            fill="var(--color-text-muted)"
          >
            {compact.format(v)}
          </text>
        </g>
      ))}
    </g>
  );
}

/**
 * Stacked columns, one per year (the mortgage: principal and interest paid each year). Values
 * are in major units for the axis; `formatValue` gives the read-out text.
 */
export function StackedColumns({
  labels,
  series,
  values,
  description,
  formatValue,
  tooltipTitle,
}: {
  labels: string[];
  series: [Series, Series];
  /** values[i] = [bottom, top] for column i, in major units. */
  values: Array<[number, number]>;
  description: string;
  formatValue: (v: number) => string;
  tooltipTitle: (i: number) => string;
}) {
  const titleId = useId();
  const n = values.length;
  const max = Math.max(1, ...values.map(([a, b]) => a + b));
  const axis = ticks(0, max);
  const top = axis[axis.length - 1]!;
  const y = (v: number) => PAD.top + PLOT_H - (v / top) * PLOT_H;
  const slot = PLOT_W / Math.max(1, n);
  const barW = Math.max(3, Math.min(24, slot - 4));
  const hover = useHover(n);
  const labelEvery = n > 20 ? 5 : n > 10 ? 2 : 1;
  return (
    <div className="flex flex-col gap-3">
      <Legend series={series} />
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby={titleId}
          className="w-full touch-pan-y"
          onPointerMove={hover.onPointerMove}
          onPointerLeave={hover.onPointerLeave}
        >
          <title id={titleId}>{description}</title>
          <YAxis values={axis} y={y} />
          {values.map(([a, b], i) => {
            const x = PAD.left + slot * i + (slot - barW) / 2;
            const yA = y(a);
            const yB = y(a + b);
            // A 2px surface gap between the two parts; the top end is rounded.
            const gap = b > 0 && a > 0 ? 2 : 0;
            const r = Math.min(4, Math.max(0, yA - gap - yB) / 2, barW / 2);
            const topPath =
              yA - gap - yB > 0
                ? `M${x},${yA - gap} V${yB + r} Q${x},${yB} ${x + r},${yB} H${x + barW - r} Q${x + barW},${yB} ${x + barW},${yB + r} V${yA - gap} Z`
                : "";
            return (
              <g key={labels[i]} opacity={hover.index === null || hover.index === i ? 1 : 0.55}>
                <rect
                  x={x}
                  y={yA}
                  width={barW}
                  height={Math.max(0, y(0) - yA)}
                  fill={series[0].color}
                />
                {topPath && <path d={topPath} fill={series[1].color} />}
                {i % labelEvery === 0 && (
                  <text
                    x={x + barW / 2}
                    y={H - 10}
                    textAnchor="middle"
                    fontSize="12"
                    fill="var(--color-text-muted)"
                  >
                    {labels[i]}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover.index !== null && (
          <Tooltip
            xPct={((PAD.left + slot * (hover.index + 0.5)) / W) * 100}
            title={tooltipTitle(hover.index)}
            rows={series.map((s, k) => ({
              name: s.name,
              color: s.color,
              value: formatValue(values[hover.index!]![k]!),
            }))}
          />
        )}
      </div>
    </div>
  );
}

/** Lines over the years (the simulator: cumulative cash flow and equity), one shared axis. */
export function LineChart({
  labels,
  series,
  values,
  description,
  formatValue,
  tooltipTitle,
}: {
  labels: string[];
  series: Series[];
  /** values[s][i]: series s at point i, in major units. */
  values: number[][];
  description: string;
  formatValue: (v: number) => string;
  tooltipTitle: (i: number) => string;
}) {
  const titleId = useId();
  const n = labels.length;
  const all = values.flat();
  const axis = ticks(Math.min(0, ...all), Math.max(1, ...all));
  const [lo, hi] = [axis[0]!, axis[axis.length - 1]!];
  const y = (v: number) => PAD.top + PLOT_H - ((v - lo) / (hi - lo || 1)) * PLOT_H;
  const slot = PLOT_W / Math.max(1, n);
  const x = (i: number) => PAD.left + slot * (i + 0.5);
  const hover = useHover(n);
  return (
    <div className="flex flex-col gap-3">
      <Legend series={series} />
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby={titleId}
          className="w-full touch-pan-y"
          onPointerMove={hover.onPointerMove}
          onPointerLeave={hover.onPointerLeave}
        >
          <title id={titleId}>{description}</title>
          <YAxis values={axis} y={y} />
          {labels.map((l, i) => (
            <text
              key={l}
              x={x(i)}
              y={H - 10}
              textAnchor="middle"
              fontSize="12"
              fill="var(--color-text-muted)"
            >
              {l}
            </text>
          ))}
          {hover.index !== null && (
            <line
              x1={x(hover.index)}
              x2={x(hover.index)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="var(--color-text-muted)"
              strokeWidth="1"
            />
          )}
          {series.map((s, k) => (
            <g key={s.name}>
              <polyline
                points={values[k]!.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {values[k]!.map((v, i) =>
                i === n - 1 || i === hover.index ? (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(v)}
                    r="5"
                    fill={s.color}
                    stroke="var(--color-surface)"
                    strokeWidth="2"
                  />
                ) : null,
              )}
            </g>
          ))}
        </svg>
        {hover.index !== null && (
          <Tooltip
            xPct={(x(hover.index) / W) * 100}
            title={tooltipTitle(hover.index)}
            rows={series.map((s, k) => ({
              name: s.name,
              color: s.color,
              value: formatValue(values[k]![hover.index!]!),
            }))}
          />
        )}
      </div>
    </div>
  );
}
