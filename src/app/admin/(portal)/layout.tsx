import { AdminShell } from "@/components/admin/admin-shell";
import { AdminUserMenu } from "@/components/admin/admin-user-menu";
import { saveAdminTheme } from "@/features/admin-users/actions";
import { requireAdminPage } from "@/lib/auth/guards";
import { getDb } from "@/db/client";
import { loadAiConfig, switchOn } from "@/features/ai/config";
import { can } from "@/lib/permissions";
import { admin } from "@/lib/i18n";

// Every admin screen depends on the signed-in admin; blocking on the server is fine here.
export const instant = false;
// Admin tables and the sidebar hold many links: one shared App Shell per route instead of a
// prefetch per link. The public site keeps the per-link default (next.config.ts).
export const prefetch = "partial";

export default async function AdminPortalLayout({ children }: LayoutProps<"/admin">) {
  const { user } = await requireAdminPage();
  const ai = await loadAiConfig(await getDb());
  const assistant =
    ai.enabled && switchOn(ai, "adminAssistant") && can(user.role, "admin.assistant");
  return (
    <AdminShell
      assistant={assistant}
      theme={user.adminTheme}
      saveTheme={saveAdminTheme}
      userMenu={<AdminUserMenu name={user.name} email={user.email} />}
      banner={
        user.readOnly ? (
          <div role="status" className="bg-ink px-4 py-2 text-center text-[13px] text-surface">
            {admin.readOnly.banner}
          </div>
        ) : null
      }
    >
      {children}
    </AdminShell>
  );
}
