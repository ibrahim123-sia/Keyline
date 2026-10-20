import { AgentsManager } from "@/components/admin/agents/agents-manager";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { listAgentsForAdmin } from "@/features/agents/queries";
import { listLocationNodes } from "@/features/locations/queries";
import { loadSettings } from "@/features/settings/queries";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "Agents" };
export const instant = false;

export default async function AgentsPage() {
  const { user } = await requireAdminPage();
  const db = await getDb();
  const [agents, locations, general, viewings, integrations] = await Promise.all([
    listAgentsForAdmin(db),
    listLocationNodes(db),
    loadSettings("general", db),
    loadSettings("viewings", db),
    loadSettings("integrations", db),
  ]);
  return (
    <>
      <PageHeader
        title="Agents"
        description="Profiles shown on listings and the team page, and used to assign leads and viewings. Drag to set the team page order."
        breadcrumb={[{ label: "Setup" }, { label: "Agents" }]}
      />
      <AgentsManager
        agents={agents}
        locations={locations}
        agencyHours={viewings.workingHours}
        firstDayOfWeek={general.firstDayOfWeek}
        calendarEnabled={integrations.googleCalendar.enabled}
        siteName={general.agencyName}
        readOnly={user.readOnly}
      />
    </>
  );
}
