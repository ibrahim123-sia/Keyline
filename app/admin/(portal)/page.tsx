import { requireAdminPage } from "@/lib/auth/guards";
import { admin, format } from "@/lib/i18n";

export const metadata = { title: admin.dashboard.title };
export const instant = false;

export default async function AdminDashboardPage() {
  const { user } = await requireAdminPage();
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold text-ink">{admin.dashboard.title}</h1>
      <p className="text-text-muted">{format(admin.dashboard.welcome, { name: user.name })}</p>
    </div>
  );
}
