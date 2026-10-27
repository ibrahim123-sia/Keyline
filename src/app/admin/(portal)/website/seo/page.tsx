import { PageHeader } from "@/components/admin/page-header";
import { RedirectsManager } from "@/components/admin/seo/redirects-manager";
import { SeoTabs } from "@/components/admin/seo/seo-tabs";
import { getDb } from "@/db/client";
import { countOpenNotFound } from "@/features/seo/not-found-log";
import { listRedirects, redirectSortable } from "@/features/seo/redirects-admin";
import { loadSettings } from "@/features/settings/queries";
import { requireAdminPage } from "@/lib/auth/guards";
import { parseTableParams } from "@/lib/table-params";

export const metadata = { title: "Redirects" };
export const instant = false;

export default async function RedirectsPage(props: PageProps<"/admin/website/seo">) {
  const { user } = await requireAdminPage();
  const params = parseTableParams(await props.searchParams, {
    sortable: redirectSortable,
    defaultSort: { id: "created", desc: true },
  });
  const db = await getDb();
  const [list, general, open] = await Promise.all([
    listRedirects(db, params),
    loadSettings("general", db),
    countOpenNotFound(db),
  ]);
  return (
    <>
      <PageHeader
        title="SEO"
        description="Redirects, missing pages and the site's SEO health."
        breadcrumb={[{ label: "Website" }, { label: "SEO" }]}
      />
      <SeoTabs current="redirects" badges={{ "not-found": open }} />
      <RedirectsManager
        rows={list.rows}
        total={list.total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        warnings={list.warnings}
        chains={list.chains}
        timeZone={general.timeZone}
        readOnly={user.readOnly}
      />
    </>
  );
}
