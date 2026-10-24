import { cn } from "cn";
import { getPriceTrends, type PriceTrends } from "@/features/price-trends/queries";
import type { Series, StatPoint } from "@/features/price-trends/series";
import { getSettings } from "@/features/settings/queries";
import { format } from "@/lib/i18n";
import { priceTrends as t } from "@/lib/i18n/dictionaries/price-trends";
import { formatMoney, type CurrencyFormat } from "@/lib/money";
import { areaUnitLabels, perAreaFromSqm, type AreaUnit } from "@/lib/units";

const monthLabel = (period: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${period}T00:00:00Z`),
  );

type Units = {
  unit: AreaUnit;
  rentPeriod: "year" | "month";
  currency: CurrencyFormat;
};

/** Stored per m² (rents per year) -> per the market's unit (and rent period), minor units. */
function shown(value: number, purpose: "sale" | "rent", u: Units): number {
  const perUnit = perAreaFromSqm(value, u.unit);
  return Math.round(purpose === "rent" && u.rentPeriod === "month" ? perUnit / 12 : perUnit);
}

const W = 600;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 16 };
const styles = {
  agency_data: { stroke: "var(--color-accent)", dash: undefined, dot: "var(--color-accent)" },
  admin_entered: { stroke: "var(--color-ink)", dash: "6 5", dot: "var(--color-ink)" },
} as const;

/** A small line chart: one line per source, months along the bottom. */
function Chart({
  series,
  purpose,
  units,
  label,
}: {
  series: Series[];
  purpose: "sale" | "rent";
  units: Units;
  label: string;
}) {
  const all = series.flatMap((s) => s.points);
  const periods = [...new Set(all.map((p) => p.period))].sort();
  const values = all.map((p) => shown(p.value, purpose, units));
  const [lo, hi] = [Math.min(...values), Math.max(...values)];
  const span = hi - lo || hi * 0.1 || 1;
  const [y0, y1] = [lo - span * 0.1, hi + span * 0.1];
  const x = (period: string) =>
    periods.length === 1
      ? W / 2
      : PAD.left + (periods.indexOf(period) / (periods.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom);
  const money = (v: number) => formatMoney(v, units.currency);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full">
      {[lo, hi].map((v) => (
        <g key={v}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--color-border)"
            strokeDasharray="2 4"
          />
          <text x={PAD.left} y={y(v) - 4} fontSize="12" fill="var(--color-text-muted)">
            {money(v)}
          </text>
        </g>
      ))}
      {series.map((s) => {
        const st = styles[s.source];
        const d = s.points
          .map((p, i) => `${i ? "L" : "M"}${x(p.period)},${y(shown(p.value, purpose, units))}`)
          .join(" ");
        return (
          <g key={s.source}>
            <path
              d={d}
              fill="none"
              stroke={st.stroke}
              strokeWidth="2.5"
              strokeDasharray={st.dash}
            />
            {s.points.map((p) => (
              <circle
                key={p.period}
                cx={x(p.period)}
                cy={y(shown(p.value, purpose, units))}
                r="3.5"
                fill={st.dot}
              />
            ))}
          </g>
        );
      })}
      <text x={PAD.left} y={H - 8} fontSize="12" fill="var(--color-text-muted)">
        {monthLabel(periods[0]!)}
      </text>
      <text
        x={W - PAD.right}
        y={H - 8}
        fontSize="12"
        textAnchor="end"
        fill="var(--color-text-muted)"
      >
        {monthLabel(periods.at(-1)!)}
      </text>
    </svg>
  );
}

function PurposeTrend({
  purpose,
  data,
  area,
  units,
}: {
  purpose: "sale" | "rent";
  data: PriceTrends["sale"];
  area: string;
  units: Units;
}) {
  const unitLabel = areaUnitLabels[units.unit];
  const what =
    purpose === "rent"
      ? format(t.perUnitRent, { unit: unitLabel, period: t.periods[units.rentPeriod] })
      : format(t.perUnit, { unit: unitLabel });
  const money = (v: number) => formatMoney(shown(v, purpose, units), units.currency);
  const heading = purpose === "sale" ? t.sale : t.rent;
  if (!data.primary || !data.latest)
    return (
      <div className="flex flex-col gap-2 rounded-[20px] bg-surface p-5 shadow-soft">
        <h3 className="text-[17px] font-semibold text-ink">{heading}</h3>
        <p className="font-semibold text-ink">{t.notEnough}</p>
        <p className="text-[13.5px] text-text-muted">{t.notEnoughHint}</p>
      </div>
    );
  const pts = data.series.flatMap((s) => s.points);
  const periods = pts.map((p) => p.period).sort();
  const change = data.change12m;
  const rows: StatPoint[] = [...pts].sort(
    (a, b) => b.period.localeCompare(a.period) || a.source.localeCompare(b.source),
  );
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[20px] bg-surface p-5 shadow-soft">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[17px] font-semibold text-ink">{heading}</h3>
        <span className="text-[13px] text-text-muted">
          {data.typeName ? format(t.typeNote, { type: data.typeName }) : t.allTypes}
        </span>
      </div>
      <p className="text-[13.5px] text-text-muted">{what}</p>
      <dl className="grid grid-cols-2 gap-3 text-[13.5px]">
        <div>
          <dt className="text-text-muted">
            {format(t.latest, { month: monthLabel(data.latest.period) })}
          </dt>
          <dd className="text-[19px] font-semibold text-ink tabular">{money(data.latest.value)}</dd>
        </div>
        {change !== null && (
          <div>
            <dt className="text-text-muted">{t.change}</dt>
            <dd
              className={cn(
                "text-[19px] font-semibold tabular",
                change >= 0 ? "text-success" : "text-danger",
              )}
            >
              {`${change >= 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(1)}%`}
            </dd>
          </div>
        )}
        {data.listingsCount ? (
          <div>
            <dt className="text-text-muted">{t.listings}</dt>
            <dd className="font-semibold text-ink tabular">{data.listingsCount}</dd>
          </div>
        ) : null}
        {data.avgDaysOnMarket != null && (
          <div>
            <dt className="text-text-muted">{t.daysOnMarket}</dt>
            <dd className="font-semibold text-ink tabular">
              {format(t.days, { n: data.avgDaysOnMarket })}
            </dd>
          </div>
        )}
      </dl>
      <Chart
        series={data.series}
        purpose={purpose}
        units={units}
        label={format(t.chartLabel, {
          what,
          area,
          from: monthLabel(periods[0]!),
          to: monthLabel(periods.at(-1)!),
          latest: money(data.latest.value),
        })}
      />
      <ul className="flex flex-col gap-1 text-[12.5px] text-text-muted">
        {data.series.map((s) => (
          <li key={s.source} className="flex items-center gap-2">
            <svg width="22" height="8" aria-hidden>
              <line
                x1="0"
                x2="22"
                y1="4"
                y2="4"
                stroke={styles[s.source].stroke}
                strokeWidth="2.5"
                strokeDasharray={styles[s.source].dash}
              />
            </svg>
            <span>
              {t.sources[s.source]}
              {s.notes.length > 0 && ` (${format(t.sourceNote, { note: s.notes.join("; ") })})`}
            </span>
          </li>
        ))}
      </ul>
      <details className="text-[13px]">
        <summary className="cursor-pointer font-semibold text-ink">{t.showFigures}</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-start">
            <thead>
              <tr className="text-text-muted">
                <th scope="col" className="py-1 text-start font-medium">
                  {t.month}
                </th>
                <th scope="col" className="py-1 text-start font-medium">
                  {t.source}
                </th>
                <th scope="col" className="py-1 text-end font-medium">
                  {t.value}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={`${p.period}-${p.source}`} className="border-t border-border">
                  <td className="py-1">{monthLabel(p.period)}</td>
                  <td className="py-1">{t.sources[p.source]}</td>
                  <td className="py-1 text-end tabular">{money(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/**
 * Price trends (11 §7) for an area page (sale and rent) or a property page (the listing's
 * purpose and, when it has enough figures, its type). Plain SVG drawn on the server, with
 * the figures in a table as the text alternative; no chart script.
 */
export async function PriceTrendsSection({
  locationId,
  typeSlug = null,
  only,
  small = false,
  id = "price-trends",
}: {
  locationId: string;
  typeSlug?: string | null;
  only?: "sale" | "rent";
  /** Property pages: the section heading size of the page's other blocks. */
  small?: boolean;
  id?: string;
}) {
  const [trends, market] = await Promise.all([
    getPriceTrends(locationId, typeSlug),
    getSettings("market"),
  ]);
  if (!trends) return null;
  const units: Units = {
    unit: market.areaUnit,
    rentPeriod: market.rentPeriod,
    currency:
      trends.currency && trends.currency !== market.baseCurrency.code
        ? { ...market.baseCurrency, code: trends.currency, symbol: trends.currency }
        : market.baseCurrency,
  };
  const purposes = only ? [only] : (["sale", "rent"] as const);
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <h2 id={`${id}-title`} className={small ? "text-h3 text-ink" : "text-h2"}>
        {format(t.title, { area: trends.locationName })}
      </h2>
      <div className={cn("grid gap-4", purposes.length > 1 && "lg:grid-cols-2")}>
        {purposes.map((p) => (
          <PurposeTrend
            key={p}
            purpose={p}
            data={trends[p]}
            area={trends.locationName}
            units={units}
          />
        ))}
      </div>
      <p className="text-[12.5px] text-text-muted">{t.disclaimer}</p>
    </section>
  );
}
