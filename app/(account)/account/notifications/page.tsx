import { NotificationsForm } from "@/components/account/profile-forms";
import { getDb } from "@/db/client";
import { loadPreferences } from "@/features/account/profile";
import { requireCustomerPage } from "@/lib/auth/guards";
import { account } from "@/lib/i18n";

export const metadata = { title: account.nav.notifications };
export const instant = false;

export default async function NotificationsPage() {
  const user = await requireCustomerPage();
  const prefs = await loadPreferences(await getDb(), user.id);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1">{account.notificationsPage.title}</h1>
      <p className="text-text-muted">{account.notificationsPage.intro}</p>
      <NotificationsForm initial={prefs} />
    </div>
  );
}
