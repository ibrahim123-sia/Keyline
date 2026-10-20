import { AdminShell } from "@/components/admin/admin-shell";
import { AdminUserMenu } from "@/components/admin/admin-user-menu";
import { saveAdminTheme } from "@/features/admin-users/actions";
import { requireAdminPage } from "@/lib/auth/guards";
import { admin } from "@/lib/i18n";

// Every admin screen depends on the signed-in admin; blocking on the server is fine here.
export const instant = false;

export default async function AdminPortalLayout({ children }: LayoutProps<"/admin">) {
  const { user } = await requireAdminPage();
  return (
    <AdminShell
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
