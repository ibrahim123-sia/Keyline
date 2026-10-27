import { notFound } from "next/navigation";
import { ContactView } from "@/components/admin/contacts/contact-view";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { loadContactPage } from "@/features/contacts/queries";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "Contact" };
export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ContactPage(props: PageProps<"/admin/contacts/[id]">) {
  const { user } = await requireAdminPage();
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const data = await loadContactPage(await getDb(), id);
  if (!data) notFound();
  const merged = data.contact.mergedIntoId;
  return (
    <>
      <PageHeader
        title={data.contact.name}
        description={
          merged ? (
            <>
              Merged into{" "}
              <a className="underline" href={`/admin/contacts/${merged}`}>
                another contact
              </a>
              .
            </>
          ) : undefined
        }
        breadcrumb={[{ label: "Contacts", href: "/admin/contacts" }, { label: data.contact.name }]}
      />
      <ContactView data={data} readOnly={user.readOnly || Boolean(merged)} />
    </>
  );
}
