import Link from "next/link";
import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "lucide-react";
import { cn } from "cn";
import { formatChange, formatValue } from "@/features/reports/format";
import type { Kpi, ReportContext } from "@/features/reports/types";
import { format } from "@/lib/i18n";
import { reports as t } from "@/lib/i18n/dictionaries/reports";

/**
 * KPI tiles (02 §4 "KPI tile"): the value, the change against the previous period with an
 * arrow (good news in green, bad in red, always with the words too), and a link into the
 * report behind it.
 */
export function KpiTiles({
  kpis,
  currency,
  linkLabel,
  hrefFor,
}: {
  kpis: Kpi[];
  currency: ReportContext["currency"];
  linkLabel?: string;
  /** The tile's link with the current period added. */
  hrefFor?: (kpi: Kpi) => string | undefined;
}) {
  return (
    <ul
      className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
      aria-label={t.overview.kpiTable}
    >
      {kpis.map((k) => {
        const good = k.change
          ? k.change.direction === "same"
            ? null
            : (k.change.direction === "up") === k.higherIsBetter
          : null;
        const Icon =
          k.change?.direction === "up"
            ? ArrowUpRightIcon
            : k.change?.direction === "down"
              ? ArrowDownRightIcon
              : MinusIcon;
        const href = hrefFor ? hrefFor(k) : k.href;
        return (
          <li
            key={k.key}
            className="flex flex-col rounded-lg border border-border bg-surface px-4 py-3"
            data-kpi={k.key}
          >
            <span className="text-[12.5px] font-medium text-text-muted">{k.label}</span>
            <span className="mt-1 text-[22px] font-semibold tracking-tight text-ink tabular-nums">
              {formatValue(k.value, k.format, currency)}
            </span>
            {k.change ? (
              <span className="mt-0.5 flex items-center gap-1 text-[12px] text-text-muted">
                <Icon
                  aria-hidden
                  className={cn(
                    "size-3.5",
                    good === true && "text-success",
                    good === false && "text-danger",
                  )}
                />
                <span className="font-semibold text-ink">
                  {formatChange(k.change, k.format, currency)}
                </span>
                <span>{t.kpis.vsPrevious}</span>
              </span>
            ) : (
              <span className="mt-0.5 text-[12px] text-text-muted">
                {k.hint ?? t.kpis.noComparison}
              </span>
            )}
            {k.previous !== null && (
              <span className="text-[12px] text-text-muted">
                {format(t.kpis.previous, { value: formatValue(k.previous, k.format, currency) })}
              </span>
            )}
            {href && linkLabel && (
              <Link
                href={href}
                className="mt-2 self-start text-[12.5px] font-semibold text-ink underline-offset-2 hover:underline"
              >
                {linkLabel}
                <span className="sr-only">: {k.label}</span>
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
