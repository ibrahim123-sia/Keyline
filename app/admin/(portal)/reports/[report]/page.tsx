import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ReportView } from "@/components/admin/reports/report-view";
import { getDb } from "@/db/client";
import { buildReport, isReportKey } from "@/features/reports/build";
import { requireAdminPage } from "@/lib/auth/guards";
import { reports as t } from "@/lib/i18n/dictionaries/reports";

export const instant = false;

export async function generateMetadata(props: PageProps<"/admin/reports/[report]">) {
  const { report } = await props.params;
  return { title: isReportKey(report) ? `${t.nav[report]} · ${t.title}` : t.title };
}

/** Admin -> Reports: sources, funnel, response time, listings, agents and AI (09 §7). */
export default async function ReportPage(props: PageProps<"/admin/reports/[report]">) {
  await requireAdminPage();
  const { report } = await props.params;
  // The overview lives at /admin/reports.
  if (!isReportKey(report) || report === "overview") notFound();
  await connection();
  const sp = await props.searchParams;
  const { data, ctx, query } = await buildReport(await getDb(), report, sp);
  return <ReportView data={data} ctx={ctx} query={query} />;
}
