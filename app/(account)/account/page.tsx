import { requireCustomerPage } from "@/lib/auth/guards";
import { account, format } from "@/lib/i18n";

export const metadata = { title: account.nav.overview };
export const instant = false;

export default async function AccountOverviewPage() {
  const user = await requireCustomerPage();
  return (
    <div className="space-y-3">
      <h1 className="text-h1">
        {format(account.overview.greeting, { name: user.name.split(" ")[0] ?? user.name })}
      </h1>
      <p>{account.overview.intro}</p>
    </div>
  );
}
