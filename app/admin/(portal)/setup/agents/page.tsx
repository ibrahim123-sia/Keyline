import { AgentsManager } from "@/components/admin/agents/agents-manager";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { listAgentsForAdmin } from "@/features/agents/queries";
import { listLocationNodes } from "@/features/locations/queries";
import { calendarStatusByAgent } from "@/features/integrations/google-calendar/calendar";
import { loadSettings } from "@/features/settings/queries";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "Agents" };
export const instant = false;

export default async function AgentsPage(props: PageProps<"/admin/setup/agents">) {
  const { user } = await requireAdminPage();
  const query = await props.searchParams;
  const db = await getDb();
  const [agents, locations, general, viewings, integrations] = await Promise.all([
    listAgentsForAdmin(db),
    listLocationNodes(db),
    loadSettings("general", db),
    loadSettings("viewings", db),
    loadSettings("integrations", db),
  ]);
  const calendars = await calendarStatusByAgent(
    db,
    agents.map((a) => a.id),
  );
  const outcome = typeof query.calendar === "string" ? query.calendar : null;
  const reason = typeof query.reason === "string" ? query.reason : null;
  return (
    <>
      {outcome && (
        <p
          role={outcome === "connected" ? "status" : "alert"}
          className={
            outcome === "connected"
              ? "mb-4 rounded-md border border-success/30 bg-success-soft px-4 py-3 text-[14px] text-success"
              : "mb-4 rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-[14px] text-danger"
          }
        >
          {outcome === "connected"
            ? "Google Calendar connected. Busy times are read every 15 minutes."
            : `Google Calendar was not connected${reason ? `: ${reason}` : "."}`}
        </p>
      )}
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
        calendars={calendars}
        siteName={general.agencyName}
        readOnly={user.readOnly}
      />
    </>
  );
}
