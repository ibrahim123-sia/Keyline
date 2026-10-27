import Link from "next/link";
import { BarChart3Icon, DownloadIcon, FileTextIcon } from "lucide-react";
import { cn } from "cn";
import { EmptyState } from "@/components/admin/empty-state";
import { PageHeader } from "@/components/admin/page-header";
import { exportHref, reportHref } from "@/features/reports/build";
import { sourceDimensions } from "@/features/reports/sources";
import type { ReportContext, ReportData, ReportKey } from "@/features/reports/types";
import { reportKeys } from "@/features/reports/types";
import { format } from "@/lib/i18n";
import { reports as t } from "@/lib/i18n/dictionaries/reports";
import { KpiTiles } from "./kpi-tiles";
import { PeriodForm, reportControl, reportLabel } from "./period-form";
import { ReportChart } from "./report-chart";
import { ReportTableView } from "./report-table";

/** Overview | Sources | Funnel | ... under the Reports header; the period carries over. */
export function ReportTabs({
  current,
  periodQuery,
}: {
  current: ReportKey;
  periodQuery: Record<string, string>;
}) {
  return (
    <nav aria-label={t.title} className="mb-5 overflow-x-auto border-b border-border">
      <ul className="flex min-w-max gap-1">
        {reportKeys.map((key) => (
          <li key={key}>
            <Link
              href={reportHref(key, periodQuery)}
              aria-current={key === current ? "page" : undefined}
              className={cn(
                "-mb-px block border-b-2 px-3 py-2 text-[13.5px] font-medium whitespace-nowrap",
                key === current
                  ? "border-accent text-ink"
                  : "border-transparent text-text-muted hover:text-ink",
              )}
            >
              {t.nav[key]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Controls a report adds to the period form (dimension and credit, stale thresholds). */
function ReportControls({ data, query }: { data: ReportData; query: Record<string, string> }) {
  if (data.key === "sources")
    return (
      <>
        <label className={reportLabel}>
          {t.sources.by}
          <select name="by" defaultValue={query.by} className={reportControl}>
            {sourceDimensions.map((d) => (
              <option key={d} value={d}>
                {t.sources.dimensions[d]}
              </option>
            ))}
          </select>
        </label>
        <label className={reportLabel}>
          {t.sources.credit}
          <select name="touch" defaultValue={query.touch} className={reportControl}>
            <option value="first">{t.sources.firstTouch}</option>
            <option value="last">{t.sources.lastTouch}</option>
          </select>
        </label>
      </>
    );
  if (data.key === "listings")
    return (
      <>
        <label className={reportLabel}>
          {t.listings.controls.verified}
          <input
            type="number"
            name="verified"
            min={1}
            max={3650}
            defaultValue={query.verified}
            className={cn(reportControl, "w-28")}
          />
        </label>
        <label className={reportLabel}>
          {t.listings.controls.quiet}
          <input
            type="number"
            name="quiet"
            min={1}
            max={365}
            defaultValue={query.quiet}
            className={cn(reportControl, "w-28")}
          />
        </label>
      </>
    );
  return null;
}

const button =
  "inline-flex h-9 items-center gap-1.5 rounded-button border border-border bg-surface px-3 text-[13.5px] font-semibold text-ink hover:border-ink/40";

/** A whole report screen: header with exports, filters, tiles, charts, tables and notes. */
export function ReportView({
  data,
  ctx,
  query,
}: {
  data: ReportData;
  ctx: ReportContext;
  query: Record<string, string>;
}) {
  const p = data.period;
  const periodOnly = Object.fromEntries(
    Object.entries(query).filter(([k]) => ["period", "from", "to"].includes(k)),
  );
  return (
    <>
      <PageHeader
        title={data.title}
        description={t.descriptions[data.key]}
        breadcrumb={[
          { label: t.title, href: reportHref("overview", periodOnly) },
          { label: data.title },
        ]}
        actions={
          <>
            <a href={exportHref(data.key, "csv", query)} className={button}>
              <DownloadIcon className="size-4" aria-hidden />
              {t.export.csv}
            </a>
            <a href={exportHref(data.key, "pdf", query)} className={button}>
              <FileTextIcon className="size-4" aria-hidden />
              {t.export.pdf}
            </a>
          </>
        }
      />
      <ReportTabs current={data.key} periodQuery={periodOnly} />
      <div className="mb-5 flex flex-col gap-2">
        <PeriodForm action={reportHref(data.key, {})} preset={p.preset} from={p.from} to={p.to}>
          <ReportControls data={data} query={query} />
        </PeriodForm>
        <p className="text-[12.5px] text-text-muted" data-period>
          {format(t.period.range, { from: p.from, to: p.to })} ·{" "}
          {format(t.period.comparedWith, { from: p.previous.from, to: p.previous.to })} ·{" "}
          {ctx.timeZone}
        </p>
      </div>
      {data.emptyState ? (
        <EmptyState
          title={data.emptyState.title}
          description={data.emptyState.description}
          icon={<BarChart3Icon className="size-5" aria-hidden />}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {data.kpis.length > 0 && <KpiTiles kpis={data.kpis} currency={ctx.currency} />}
          {data.charts.length > 0 && (
            <div className={cn("grid gap-4", data.charts.length > 1 && "lg:grid-cols-2")}>
              {data.charts.map((c) => (
                <ReportChart key={c.id} chart={c} tableNote={t.table.chartNote} />
              ))}
            </div>
          )}
          {data.tables.map((table) => (
            <ReportTableView key={table.id} table={table} currency={ctx.currency} />
          ))}
        </div>
      )}
      <ul className="mt-6 flex list-disc flex-col gap-1 ps-5 text-[12.5px] text-text-muted">
        {data.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </>
  );
}
