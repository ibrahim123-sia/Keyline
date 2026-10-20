import { PageHeader } from "@/components/admin/page-header";
import { PropertyImport } from "@/components/admin/properties/import/property-import";
import { getDb } from "@/db/client";
import { loadImportContext } from "@/features/properties/import";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "Import properties" };
export const instant = false;

export default async function ImportPropertiesPage() {
  const { user } = await requireAdminPage();
  const context = await loadImportContext(await getDb());
  return (
    <>
      <PageHeader
        title="Import properties"
        description="Add many listings at once from a spreadsheet. Every row becomes a draft; nothing is published."
        breadcrumb={[{ label: "Properties", href: "/admin/properties" }, { label: "Import" }]}
      />
      <PropertyImport context={context} readOnly={user.readOnly} />
    </>
  );
}
