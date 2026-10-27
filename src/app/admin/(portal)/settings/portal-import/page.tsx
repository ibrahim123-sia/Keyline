import { PortalImport } from "@/components/admin/inbox/portal-import";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { loadSettings } from "@/features/settings/queries";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "Import portal leads" };
export const instant = false;

/** Settings -> Integrations -> Property portals -> Import CSV (13 §1 "Portals"). */
export default async function PortalImportPage() {
  const { user } = await requireAdminPage();
  const db = await getDb();
  const integrations = await loadSettings("integrations", db);
  const leads = await loadSettings("leads", db);
  const portals = [
    ...new Set([
      ...integrations.portals.filter((p) => p.enabled).map((p) => p.name),
      ...leads.portalInboxes.map((p) => p.portal),
    ]),
  ];
  return (
    <>
      <PageHeader
        title="Import portal leads"
        description="Upload a portal's lead export (CSV). Each row becomes a lead from that portal, or joins the person's open lead."
        breadcrumb={[
          { label: "Settings", href: "/admin/settings" },
          { label: "Integrations", href: "/admin/settings/integrations" },
          { label: "Import portal leads" },
        ]}
      />
      <PortalImport portals={portals} readOnly={user.readOnly} />
    </>
  );
}
