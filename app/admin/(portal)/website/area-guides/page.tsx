import { GuidesManager } from "@/components/admin/area-guides/guides-manager";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { guideLocationNodes, listGuidesAdmin } from "@/features/area-guides/queries";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "Area guides" };
export const instant = false;

export default async function AreaGuidesPage() {
  const { user } = await requireAdminPage();
  const db = await getDb();
  const guides = await listGuidesAdmin(db);
  const locations = await guideLocationNodes(db);
  return (
    <>
      <PageHeader
        title="Area guides"
        description="What it is like to live in each area. The site adds live numbers from your listings."
        breadcrumb={[{ label: "Website" }, { label: "Area guides" }]}
      />
      <GuidesManager guides={guides} locations={locations} readOnly={user.readOnly} />
    </>
  );
}
