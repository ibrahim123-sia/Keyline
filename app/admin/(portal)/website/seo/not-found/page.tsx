import { PageHeader } from "@/components/admin/page-header";
import { NotFoundManager } from "@/components/admin/seo/not-found-manager";
import { SeoTabs } from "@/components/admin/seo/seo-tabs";
import { getDb } from "@/db/client";
import { listNotFound, notFoundSortable } from "@/features/seo/not-found-log";
import { loadSettings } from "@/features/settings/queries";
import { requireAdminPage } from "@/lib/auth/guards";
import { parseTableParams } from "@/lib/table-params";

export const metadata = { title: "404 monitor" };
export const instant = false;

export default async function NotFoundMonitorPage(
  props: PageProps<"/admin/website/seo/not-found">,
) {
  const { user } = await requireAdminPage();
  const params = parseTableParams(await props.searchParams, {
    sortable: notFoundSortable,
    defaultSort: { id: "hits", desc: true },
  });
  const db = await getDb();
  const [list, general] = await Promise.all([
    listNotFound(db, params),
    loadSettings("general", db),
  ]);
  return (
    <>
      <PageHeader
        title="SEO"
        description="Redirects, missing pages and the site's SEO health."
        breadcrumb={[{ label: "Website" }, { label: "SEO" }]}
      />
      <SeoTabs current="not-found" badges={{ "not-found": list.open }} />
      <NotFoundManager
        rows={list.rows}
        total={list.total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        resolvedView={params.get("status") === "resolved"}
        timeZone={general.timeZone}
        readOnly={user.readOnly}
      />
    </>
  );
}
