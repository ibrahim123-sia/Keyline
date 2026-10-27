import { PageHeader } from "@/components/admin/page-header";
import { AdminUsersManager } from "@/components/admin/settings/admin-users-manager";
import { getDb } from "@/db/client";
import { listAdmins, listApiTokens } from "@/features/admin-users/queries";
import { requireAdminPage } from "@/lib/auth/guards";

export const metadata = { title: "Admin users" };
export const instant = false;

export default async function AdminUsersPage() {
  const { user } = await requireAdminPage();
  const db = await getDb();
  const [admins, tokens] = await Promise.all([listAdmins(db), listApiTokens(db)]);
  return (
    <>
      <PageHeader
        title="Admin users"
        description="Who can use the admin portal, and the API tokens for MCP clients."
        breadcrumb={[{ label: "Settings" }, { label: "Admin users" }]}
      />
      <AdminUsersManager
        admins={admins}
        tokens={tokens}
        currentUserId={user.id}
        readOnly={user.readOnly}
      />
    </>
  );
}
