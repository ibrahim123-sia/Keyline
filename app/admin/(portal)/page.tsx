import { admin } from "@/lib/i18n";

export const metadata = { title: admin.dashboard.title };

export default function AdminDashboardPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold text-ink">{admin.dashboard.title}</h1>
    </div>
  );
}
