import { PageHeader } from "@/components/admin/page-header";
import { SeoReportView } from "@/components/admin/seo/seo-report";
import { SeoTabs } from "@/components/admin/seo/seo-tabs";
import { getDb } from "@/db/client";
import { countOpenNotFound } from "@/features/seo/not-found-log";
import { buildSeoReport } from "@/features/seo/report";
import { loadSettings } from "@/features/settings/queries";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "SEO report" };
export const instant = false;

export default async function SeoReportPage() {
  const { user } = await requireAdminPage();
  const db = await getDb();
  const report = await buildSeoReport(db);
  const [general, open] = await Promise.all([loadSettings("general", db), countOpenNotFound(db)]);
  return (
    <>
      <PageHeader
        title="SEO"
        description="Redirects, missing pages and the site's SEO health."
        breadcrumb={[{ label: "Website" }, { label: "SEO" }]}
      />
      <SeoTabs current="report" badges={{ "not-found": open }} />
      <SeoReportView report={report} timeZone={general.timeZone} readOnly={user.readOnly} />
    </>
  );
}
