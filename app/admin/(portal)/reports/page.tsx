import { connection } from "next/server";
import { ReportView } from "@/components/admin/reports/report-view";
import { getDb } from "@/db/client";
import { buildReport } from "@/features/reports/build";
import { requireAdminPage } from "@/lib/auth/guards";
import { reports as t } from "@/lib/i18n/dictionaries/reports";

export const metadata = { title: `${t.nav.overview} · ${t.title}` };
export const instant = false;

/** Admin -> Reports -> Overview (09 §7). */
export default async function ReportsOverviewPage(props: PageProps<"/admin/reports">) {
  await requireAdminPage();
  await connection();
  const sp = await props.searchParams;
  const { data, ctx, query } = await buildReport(await getDb(), "overview", sp);
  return <ReportView data={data} ctx={ctx} query={query} />;
}
