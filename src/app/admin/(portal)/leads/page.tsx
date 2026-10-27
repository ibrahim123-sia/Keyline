import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { UploadIcon } from "lucide-react";
import Link from "next/link";
import { LeadsManager } from "@/components/admin/leads/leads-manager";
import { NewLeadDialog } from "@/components/admin/leads/new-lead-dialog";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { currentAgencyId } from "@/db/schema/_common";
import { properties } from "@/db/schema/properties";
import { liveStatuses } from "@/features/properties/status";
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
  const listings = user.readOnly
    ? []
    : await db
        .select({ id: properties.id, reference: properties.reference, title: properties.title })
        .from(properties)
        .where(
          and(
            eq(properties.agencyId, currentAgencyId()),
            isNull(properties.deletedAt),
            inArray(properties.status, [...liveStatuses]),
          ),
        )
        .orderBy(asc(properties.reference))
        .limit(500);
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
        actions={
          !user.readOnly && (
            <>
              <Button asChild variant="outline">
                <Link href="/admin/leads/import">
                  <UploadIcon aria-hidden /> Import
                </Link>
              </Button>
              <NewLeadDialog
                leadTypes={options.leadTypes}
                agents={options.agents}
                listings={listings.map((l) => ({ id: l.id, name: `${l.reference} · ${l.title}` }))}
              />
            </>
          )
        }
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
