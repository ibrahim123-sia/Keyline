import { DevelopersManager } from "@/components/admin/developers/developers-manager";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { developerOptions, developerSortable, listDevelopers } from "@/features/developers/queries";
import { loadSettings } from "@/features/settings/queries";
import { requireAdminPage } from "@/lib/auth/guards";
import { parseTableParams } from "@/lib/table-params";

export const metadata = { title: "Developers" };
export const instant = false;

export default async function DevelopersPage(props: PageProps<"/admin/setup/developers">) {
  const { user } = await requireAdminPage();
  const params = parseTableParams(await props.searchParams, {
    sortable: developerSortable,
    defaultSort: { id: "name", desc: false },
  });
  const db = await getDb();
  const [{ rows, total }, options, general] = await Promise.all([
    listDevelopers(params, db),
    developerOptions(db),
    loadSettings("general", db),
  ]);
  return (
    <>
      <PageHeader
        title="Developers"
        description="The companies behind projects and off-plan listings. Each one gets a page on the site."
        breadcrumb={[{ label: "Setup" }, { label: "Developers" }]}
      />
      <DevelopersManager
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        options={options}
        siteName={general.agencyName}
        readOnly={user.readOnly}
      />
    </>
  );
}
