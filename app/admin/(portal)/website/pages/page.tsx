import { PageHeader } from "@/components/admin/page-header";
import { PagesManager } from "@/components/admin/pages/pages-manager";
import { getDb } from "@/db/client";
import { listPages, pageSortable } from "@/features/cms/page-admin";
import { requireAdminPage } from "@/lib/auth/guards";
import { parseTableParams } from "@/lib/table-params";

export const metadata = { title: "Pages" };
export const instant = false;

/** Admin -> Website -> Pages (08 §1). */
export default async function PagesPage(props: PageProps<"/admin/website/pages">) {
  const { user } = await requireAdminPage();
  const params = parseTableParams(await props.searchParams, {
    sortable: pageSortable,
    defaultSort: { id: "updated", desc: true },
  });
  const db = await getDb();
  const { rows, total, trashCount } = await listPages(params, db);
  return (
    <>
      <PageHeader
        title="Pages"
        description="Pages built from sections: the home page, about, contact, campaign landing pages and policies. Publish a page, then add it to a menu."
        breadcrumb={[{ label: "Website" }, { label: "Pages" }]}
      />
      <PagesManager
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        trash={params.get("trash") === "1"}
        trashCount={trashCount}
        readOnly={user.readOnly}
      />
    </>
  );
}
