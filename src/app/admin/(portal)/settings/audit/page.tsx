import { PageHeader } from "@/components/admin/page-header";
import { AuditLog } from "@/components/admin/settings/audit-log";
import { getDb } from "@/db/client";
import { auditFilterOptions, auditSortable, listAuditEntries } from "@/features/audit/queries";
import { requireAdminPage } from "@/lib/auth/guards";
import { parseTableParams } from "@/lib/table-params";

export const metadata = { title: "Audit log" };
export const instant = false;

export default async function AuditLogPage(props: PageProps<"/admin/settings/audit">) {
  await requireAdminPage();
  const params = parseTableParams(await props.searchParams, {
    sortable: auditSortable,
    defaultSort: { id: "newest", desc: false },
    pageSize: 50,
    maxPageSize: 200,
  });
  const db = await getDb();
  const [{ rows, total }, options] = await Promise.all([
    listAuditEntries(params, db),
    auditFilterOptions(db),
  ]);
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change made in the admin portal, by admins, the AI assistant (once confirmed) and the system. Entries cannot be edited or deleted."
        breadcrumb={[{ label: "Settings" }, { label: "Audit log" }]}
      />
      <AuditLog
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        modules={options.modules}
        actors={options.actors}
      />
    </>
  );
}
