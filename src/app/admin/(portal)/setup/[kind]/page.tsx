import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { MasterDataManager } from "@/components/admin/master-data/master-data-manager";
import { isMasterKind, masterLabels } from "@/features/master-data/config";
import { listMasterForAdmin } from "@/features/master-data/queries";
import { requireAdminPage } from "@/lib/auth/guards";

export const instant = false;

export async function generateMetadata(props: PageProps<"/admin/setup/[kind]">) {
  const { kind } = await props.params;
  return { title: isMasterKind(kind) ? masterLabels[kind].title : "Setup" };
}

export default async function MasterDataPage(props: PageProps<"/admin/setup/[kind]">) {
  const { user } = await requireAdminPage();
  const { kind } = await props.params;
  if (!isMasterKind(kind)) notFound();
  const items = await listMasterForAdmin(kind);
  const labels = masterLabels[kind];
  return (
    <>
      <PageHeader
        title={labels.title}
        description={labels.description}
        breadcrumb={[{ label: "Setup" }, { label: labels.title }]}
      />
      <MasterDataManager
        kind={kind}
        items={JSON.parse(JSON.stringify(items))}
        readOnly={user.readOnly}
      />
    </>
  );
}
