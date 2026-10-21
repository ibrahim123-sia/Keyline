import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ListingCard, type CardContext } from "@/components/site/listings/listing-card";
import { ShortlistCard } from "@/components/site/shortlist-card";
import { getDb } from "@/db/client";
import { publicCards } from "@/features/listings/public-cards";
import { getSettings } from "@/features/settings/queries";
import { visitorCurrency } from "@/features/site/currency";
import { loadShortlist, recordShortlistOpen } from "@/features/shortlists/store";

export const instant = false;

export const metadata: Metadata = {
  title: "Homes picked for you",
  robots: { index: false, follow: false },
};

/** A lead's personal shortlist (09 §4 "Send properties"): opens and opened homes are counted. */
export default async function ShortlistPage(props: PageProps<"/s/[token]">) {
  const { token } = await props.params;
  const db = await getDb();
  const list = await loadShortlist(db, token);
  if (!list) notFound();
  after(() => recordShortlistOpen(db, token));

  const cards = await publicCards(list.propertyIds);
  const { code, rates } = await visitorCurrency();
  const market = await getSettings("market");
  const ctx: CardContext = {
    visitorCurrency: code,
    rates,
    areaUnit: market.areaUnit,
    distanceUnit: market.distanceUnit,
  };
  const first = list.contactName.split(/\s+/)[0] || list.contactName;
  return (
    <div className="container-site flex flex-col gap-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1">Homes picked for {first}</h1>
        <p className="text-[15px] text-text-muted">
          {list.agentName ? `${list.agentName} chose these for you.` : "Chosen for you."}{" "}
          {new Date(list.createdAt).toLocaleDateString("en", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
        {list.message && (
          <p className="max-w-2xl rounded-[16px] bg-surface p-4 text-[15px] whitespace-pre-line text-ink shadow-soft">
            {list.message}
          </p>
        )}
      </header>
      {cards.length === 0 ? (
        <p className="text-[15px] text-text-muted">
          These homes are no longer available. Ask {list.agentName ?? "us"} for new ones.
        </p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c, i) => (
            <li key={c.id}>
              <ShortlistCard token={token} propertyId={c.id}>
                <ListingCard listing={c} ctx={ctx} priority={i === 0} headingLevel={2} />
              </ShortlistCard>
            </li>
          ))}
        </ul>
      )}
      {cards.length > 0 && cards.length < list.propertyIds.length && (
        <p className="text-[14px] text-text-muted">
          Some homes on this list are no longer available.
        </p>
      )}
    </div>
  );
}
