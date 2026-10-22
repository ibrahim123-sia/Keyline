import Link from "next/link";
import { RecentHomes } from "@/components/account/recent-homes";
import { getDb } from "@/db/client";
import { accountCardContext } from "@/features/account/card-context";
import { savedSearchesOf, upcomingTours } from "@/features/account/queries";
import { savedIds } from "@/features/account/store";
import { requireCustomerPage } from "@/lib/auth/guards";
import { account, format } from "@/lib/i18n";

export const metadata = { title: account.nav.overview };
export const instant = false;

/** Overview (12 §2): greeting, upcoming tours, new matches, recently viewed. */
export default async function AccountOverviewPage() {
  const user = await requireCustomerPage();
  const db = await getDb();
  const t = account.overview;
  const [tours, searches, saved, ctx] = [
    await upcomingTours(db, user.id),
    await savedSearchesOf(db, user.id),
    await savedIds(db, user.id),
    await accountCardContext(),
  ];
  const tile = "flex flex-col gap-1 rounded-[20px] bg-surface p-5 shadow-soft";
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-h1">
          {format(t.greeting, { name: user.name.split(" ")[0] ?? user.name })}
        </h1>
        <p className="mt-1 text-text-muted">{t.intro}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/account/tours" className={tile}>
          <span className="text-[14px] font-semibold text-text-muted">{t.tours}</span>
          <span className="text-h2 text-ink">{tours || t.toursNone}</span>
        </Link>
        <Link href="/account/saved" className={tile}>
          <span className="text-[14px] font-semibold text-text-muted">{t.saved}</span>
          <span className="text-h2 text-ink">
            {saved.properties.length + saved.projects.length}
          </span>
        </Link>
      </div>
      <section aria-labelledby="matches" className="flex flex-col gap-3">
        <h2 id="matches" className="text-h3 text-ink">
          {t.searches}
        </h2>
        {searches.length === 0 ? (
          <p className="text-text-muted">{t.searchesNone}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-[20px] bg-surface shadow-soft">
            {searches.slice(0, 5).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 p-4">
                <a href={s.href} className="min-w-0 font-semibold text-ink hover:underline">
                  {s.name}
                </a>
                <span className="shrink-0 text-[14px] text-text-muted">
                  {format(t.newMatches, { count: s.newMatches })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <RecentHomes ctx={ctx} />
    </div>
  );
}
