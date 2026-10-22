import { and, eq } from "drizzle-orm";
import { PageHeader } from "@/components/admin/page-header";
import { NewViewingForm } from "@/components/admin/viewings/new-viewing-form";
import { getDb } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { contacts, leads } from "@/db/schema/crm";
import { loadSettings } from "@/features/settings/queries";
import { activeAgents, bookableTargets } from "@/features/viewings/admin";
import { requireAdminPage } from "@/lib/auth/guards";
import { first } from "@/lib/table-params";

export const metadata = { title: "New viewing" };
export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /admin/viewings/new?lead=&property=&project= (09 §5): the team books a viewing. */
export default async function NewViewingPage(props: PageProps<"/admin/viewings/new">) {
  await requireAdminPage({ write: true });
  const sp = await props.searchParams;
  const db = await getDb();
  const leadParam = first(sp.lead);
  const [lead] =
    leadParam && UUID.test(leadParam)
      ? await db
          .select({
            id: leads.id,
            agentId: leads.agentId,
            propertyIds: leads.propertyIds,
            projectIds: leads.projectIds,
            name: contacts.name,
            email: contacts.email,
            phone: contacts.phone,
          })
          .from(leads)
          .innerJoin(contacts, eq(contacts.id, leads.contactId))
          .where(and(eq(leads.id, leadParam), eq(leads.agencyId, currentAgencyId())))
      : [];
  const targets = await bookableTargets(db);
  const property = first(sp.property);
  const project = first(sp.project);
  const general = await loadSettings("general", db);
  return (
    <>
      <PageHeader
        title="New viewing"
        description={`Times are in the agency's time zone (${general.timeZone}). The visitor gets the confirmation by email when they have one.`}
        breadcrumb={[{ label: "Viewings", href: "/admin/viewings" }, { label: "New viewing" }]}
      />
      <NewViewingForm
        lead={lead ?? null}
        homes={targets.homes}
        projects={targets.projects}
        agents={await activeAgents(db)}
        initialPropertyId={
          property && UUID.test(property) ? property : (lead?.propertyIds[0] ?? null)
        }
        initialProjectId={project && UUID.test(project) ? project : (lead?.projectIds[0] ?? null)}
      />
    </>
  );
}
