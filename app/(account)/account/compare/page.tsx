import { CompareButton } from "@/components/site/account/compare-button";
import { ListingCard } from "@/components/site/listings/listing-card";
import { getDb } from "@/db/client";
import { accountCardContext } from "@/features/account/card-context";
import { compareCardsOf } from "@/features/account/queries";
import { requireCustomerPage } from "@/lib/auth/guards";
import { account } from "@/lib/i18n";

export const metadata = { title: account.nav.compare };
export const instant = false;

const t = account.comparePage;

/** Compare (12 §2): the homes picked to compare (the side-by-side page comes in Phase 8). */
export default async function ComparePage() {
  const user = await requireCustomerPage();
  const [cards, ctx] = [await compareCardsOf(await getDb(), user.id), await accountCardContext()];
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">{t.title}</h1>
      {cards.length === 0 ? (
        <p className="text-text-muted">{t.none}</p>
      ) : (
        <>
          <p className="text-[14px] text-text-muted">{t.soon}</p>
          <ul className="grid gap-6 sm:grid-cols-2">
            {cards.map((c) => (
              <li key={c.id} className="flex flex-col gap-2">
                <ListingCard listing={c} ctx={ctx} />
                <div>
                  <CompareButton propertyId={c.id} label={c.title} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
