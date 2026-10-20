import { account } from "@/lib/i18n";

export const metadata = { title: account.nav.overview };

export default function AccountOverviewPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-h1">{account.nav.overview}</h1>
      <p>{account.overview.intro}</p>
    </div>
  );
}
