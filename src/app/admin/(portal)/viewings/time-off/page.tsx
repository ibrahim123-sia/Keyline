import { PageHeader } from "@/components/admin/page-header";
import { TimeOffManager } from "@/components/admin/viewings/time-off-manager";
import { getDb } from "@/db/client";
import { activeAgents, listOverrides } from "@/features/viewings/admin";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "Days off and hours" };
export const instant = false;

/** Agents' days off and other hours (09 §5): free viewing times follow them. */
export default async function TimeOffPage() {
  const { user } = await requireAdminPage();
  const db = await getDb();
  const [rows, agents] = [await listOverrides(db), await activeAgents(db)];
  return (
    <>
      <PageHeader
        title="Days off and hours"
        description="Days an agent is away or works other hours. Visitors are only offered the times that are left."
        breadcrumb={[
          { label: "Viewings", href: "/admin/viewings" },
          { label: "Days off and hours" },
        ]}
      />
      <TimeOffManager rows={rows} agents={agents} readOnly={user.readOnly} />
    </>
  );
}
