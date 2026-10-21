import { notFound } from "next/navigation";
import { LeadPage } from "@/components/admin/leads/lead-page";
import { SendHomes, Shortlists } from "@/components/admin/leads/send-homes";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { loadLeadPage } from "@/features/leads/page-data";
import { requireAdminPage } from "@/lib/auth/guards";
import { leads as t } from "@/lib/i18n/dictionaries/leads";

export const metadata = { title: "Lead" };
export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LeadDetailPage(props: PageProps<"/admin/leads/[id]">) {
  const { user } = await requireAdminPage();
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const data = await loadLeadPage(await getDb(), id);
  if (!data) notFound();
  const merged = data.lead.mergedIntoId;
  return (
    <>
      <PageHeader
        title={data.contact.name}
        description={
          merged ? (
            <>
              Merged into{" "}
              <a className="underline" href={`/admin/leads/${merged}`}>
                another lead
              </a>
              ; this page is kept for the record.
            </>
          ) : (
            `${data.lead.type[0]!.toUpperCase()}${data.lead.type.slice(1)} · ${t.sources[data.lead.source]} · came in ${new Date(data.lead.createdAt).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}`
          )
        }
        breadcrumb={[{ label: "Leads", href: "/admin/leads" }, { label: data.contact.name }]}
      />
      <LeadPage
        data={data}
        readOnly={user.readOnly || Boolean(merged)}
        sendHomes={
          <SendHomes
            leadId={data.lead.id}
            homes={[...data.matching, ...data.interest]}
            hasEmail={Boolean(data.contact.email)}
          />
        }
        shortlists={<Shortlists items={data.shortlists} now={data.now} />}
      />
    </>
  );
}
