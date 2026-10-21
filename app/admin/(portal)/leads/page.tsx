import { PageHeader } from "@/components/admin/page-header";
import { LeadsManager } from "@/components/admin/leads/leads-manager";
import { getDb } from "@/db/client";
import { leadFiltersFrom, leadSortable } from "@/features/leads/filters";
import { kanbanLeads, leadListOptions, listLeads } from "@/features/leads/list";
import { listSavedViews } from "@/features/saved-views/queries";
import { requireAdminPage } from "@/lib/auth/guards";
import { first, parseTableParams } from "@/lib/table-params";

export const metadata = { title: "Leads" };
export const instant = false;

export default async function LeadsPage(props: PageProps<"/admin/leads">) {
  const { user } = await requireAdminPage();
  const sp = await props.searchParams;
  const params = parseTableParams(sp, {
    sortable: leadSortable,
    defaultSort: { id: "created", desc: true },
  });
  const view = first(sp.view) === "board" ? "board" : "table";
  const db = await getDb();
  const now = new Date();
  const options = await leadListOptions(db);
  const views = await listSavedViews("leads", db);
  const data =
    view === "board"
      ? {
          rows: await kanbanLeads(leadFiltersFrom(params.get, params.getAll, params.q), db, now),
          total: 0,
        }
      : await listLeads(params, db, now);
  return (
    <>
      <PageHeader
        title="Leads"
        description="Everyone who got in touch, where they came from and who answers them. Filters stay in the address, so a view can be shared."
        breadcrumb={[{ label: "Leads" }]}
      />
      <LeadsManager
        view={view}
        rows={data.rows}
        total={data.total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        options={options}
        savedViews={views}
        readOnly={user.readOnly}
        now={now.toISOString()}
      />
    </>
  );
}
