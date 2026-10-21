import { ContactsManager } from "@/components/admin/contacts/contacts-manager";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { contactSortable, listContacts } from "@/features/contacts/queries";
import { requireAdminPage } from "@/lib/auth/guards";
import { parseTableParams } from "@/lib/table-params";

export const metadata = { title: "Contacts" };
export const instant = false;

export default async function ContactsPage(props: PageProps<"/admin/contacts">) {
  await requireAdminPage();
  const params = parseTableParams(await props.searchParams, {
    sortable: contactSortable,
    defaultSort: { id: "created", desc: true },
  });
  const { rows, total } = await listContacts(params, await getDb());
  return (
    <>
      <PageHeader
        title="Contacts"
        description="The people behind the leads. One person can have several leads, for example buying and selling."
        breadcrumb={[{ label: "Contacts" }]}
      />
      <ContactsManager
        rows={rows}
        total={total}
        page={params.page}
        pageSize={params.pageSize}
        sort={params.sort}
        now={new Date().toISOString()}
      />
    </>
  );
}
