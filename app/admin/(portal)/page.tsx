import Link from "next/link";
import { connection } from "next/server";
import { ChevronRightIcon } from "lucide-react";
import { DashboardSuggestions } from "@/components/admin/dashboard/suggestions";
import { KpiTiles } from "@/components/admin/reports/kpi-tiles";
import { PeriodForm } from "@/components/admin/reports/period-form";
import { ReportChart } from "@/components/admin/reports/report-chart";
import { getDb } from "@/db/client";
import { reportHref } from "@/features/reports/build";
import { loadReportContext } from "@/features/reports/context";
import { bucketTrend, dailyTrend, overviewKpis } from "@/features/reports/overview";
import { parsePeriodParams, periodQuery, type PeriodPreset } from "@/features/reports/period";
import { loadDashboardSuggestions } from "@/features/reports/suggestions";
import { reportKeys } from "@/features/reports/types";
import { requireAdminPage } from "@/lib/auth/guards";
import { admin, format } from "@/lib/i18n";
import { reports as t } from "@/lib/i18n/dictionaries/reports";

export const metadata = { title: admin.dashboard.title };
export const instant = false;

const dashboardPresets: PeriodPreset[] = ["7d", "30d", "90d", "month", "lastMonth", "custom"];

/**
 * The admin dashboard (02 §4 KPI tiles, 09 §7): this period's leads, viewings, deals, deal
 * value, first response, conversion and unanswered leads against the period before, in the
 * agency's time zone, each linking into its report; the new-leads trend; and the column for
 * AI suggestion cards.
 */
export default async function AdminDashboardPage(props: PageProps<"/admin">) {
  const { user } = await requireAdminPage();
  await connection();
  const sp = await props.searchParams;
  const db = await getDb();
  const ctx = await loadReportContext(db, parsePeriodParams(sp));
  const kpis = await overviewKpis(db, ctx);
  const trend = bucketTrend(await dailyTrend(db, ctx.period, ctx.timeZone));
  const suggestions = await loadDashboardSuggestions(db, ctx);
  const query = periodQuery(ctx.period);
  const p = ctx.period;
  const withPeriod = (href: string | undefined) => {
    if (!href) return undefined;
    // The unanswered tile opens the live leads list, not a period report.
    if (!href.startsWith("/admin/reports")) return href;
    return `${href}?${new URLSearchParams(query).toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{admin.dashboard.title}</h1>
          <p className="text-text-muted">{format(admin.dashboard.welcome, { name: user.name })}</p>
        </div>
        <PeriodForm
          action="/admin"
          preset={p.preset}
          from={p.from}
          to={p.to}
          presets={dashboardPresets}
        />
      </div>
      <p className="-mt-3 text-[12.5px] text-text-muted" data-period>
        {format(t.period.range, { from: p.from, to: p.to })} ·{" "}
        {format(t.period.comparedWith, { from: p.previous.from, to: p.previous.to })} ·{" "}
        {ctx.timeZone}
      </p>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <KpiTiles
            kpis={kpis}
            currency={ctx.currency}
            linkLabel={t.dashboard.openReport}
            hrefFor={(k) => withPeriod(k.href)}
          />
          <ReportChart
            chart={{
              id: "leads",
              title: t.dashboard.leadsChart,
              kind: trend.unit === "day" && trend.points.length <= 31 ? "bar" : "line",
              data: trend.points.map((d) => ({ x: d.x, leads: d.leads })),
              series: [{ key: "leads", label: t.overview.seriesLeads }],
              format: "int",
            }}
            tableNote={t.table.chartNote}
          />
        </div>
        <aside className="flex flex-col gap-6" aria-label={t.dashboard.reportsHeading}>
          <DashboardSuggestions suggestions={suggestions} />
          <section aria-labelledby="dashboard-reports" className="flex flex-col gap-2">
            <h2 id="dashboard-reports" className="text-[14px] font-semibold text-ink">
              {t.dashboard.reportsHeading}
            </h2>
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {reportKeys.map((key) => (
                <li key={key}>
                  <Link
                    href={reportHref(key, query)}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted"
                  >
                    <span>
                      <span className="block text-[13.5px] font-medium text-ink">{t.nav[key]}</span>
                      <span className="block text-[12px] text-text-muted">
                        {t.descriptions[key]}
                      </span>
                    </span>
                    <ChevronRightIcon className="size-4 shrink-0 text-text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
