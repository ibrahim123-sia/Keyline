import { SavedHomesManager, type HomeView } from "@/components/account/saved-homes-manager";
import { getDb } from "@/db/client";
import { accountCardContext } from "@/features/account/card-context";
import { savedHomesOf } from "@/features/account/queries";
import { siteOrigin } from "@/features/site/url";
import { requireCustomerPage } from "@/lib/auth/guards";
import { displayPrice } from "@/lib/currency-display";
import { account, format } from "@/lib/i18n";

export const metadata = { title: account.nav.saved };
export const instant = false;

/** Saved homes (12 §2): lists, notes, what changed since saving, share a list. */
export default async function SavedHomesPage() {
  const user = await requireCustomerPage();
  const db = await getDb();
  const [{ lists, homes }, ctx] = [await savedHomesOf(db, user.id), await accountCardContext()];
  const t = account.savedPage;
  const views: HomeView[] = homes.map((h) => {
    let change: string | null = null;
    if (h.change?.kind === "status")
      change = format(t.nowStatus, { status: h.change.status!.toLowerCase() });
    else if (h.change && h.card) {
      const amount = displayPrice(
        h.change.amount!,
        h.card.currency,
        ctx.visitorCurrency,
        ctx.rates,
      ).text;
      change = format(h.change.kind === "price_down" ? t.priceDown : t.priceUp, { amount });
    }
    return { id: h.id, listId: h.listId, note: h.note, card: h.card, project: h.project, change };
  });
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1">{t.title}</h1>
      <SavedHomesManager lists={lists} homes={views} ctx={ctx} origin={siteOrigin()} />
    </div>
  );
}
