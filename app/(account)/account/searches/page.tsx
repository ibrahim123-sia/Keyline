import { SavedSearchesManager } from "@/components/account/saved-searches-manager";
import { getDb } from "@/db/client";
import { savedSearchesOf } from "@/features/account/queries";
import { requireCustomerPage } from "@/lib/auth/guards";
import { account } from "@/lib/i18n";

export const metadata = { title: account.nav.searches };
export const instant = false;

export default async function SavedSearchesPage() {
  const user = await requireCustomerPage();
  const searches = await savedSearchesOf(await getDb(), user.id);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">{account.searchesPage.title}</h1>
      <SavedSearchesManager searches={searches} />
    </div>
  );
}
