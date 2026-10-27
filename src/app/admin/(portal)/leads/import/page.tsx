import { LeadImport } from "@/components/admin/leads/lead-import";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { loadLeadImportContext } from "@/features/leads/import";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "Import leads" };
export const instant = false;

export default async function ImportLeadsPage() {
  const { user } = await requireAdminPage();
  const context = await loadLeadImportContext(await getDb());
  return (
    <>
      <PageHeader
        title="Import leads"
        description="Add many leads at once from a spreadsheet. People you already know join their open lead instead of becoming a duplicate."
        breadcrumb={[{ label: "Leads", href: "/admin/leads" }, { label: "Import" }]}
      />
      <LeadImport context={context} readOnly={user.readOnly} />
    </>
  );
}
