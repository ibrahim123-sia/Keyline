"use client";

import { useEffect, useState } from "react";
import { ListingCard, type CardContext } from "@/components/site/listings/listing-card";
import type { ListingCardData } from "@/features/listings/cards";
import { property as t } from "@/lib/i18n/dictionaries/property";

/** The recently viewed cards, loaded only when the section comes near the screen. */
export function RecentlyViewedCards({ ids, ctx }: { ids: string[]; ctx: CardContext }) {
  const [cards, setCards] = useState<ListingCardData[]>([]);
  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/listings/cards?ids=${ids.join(",")}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : { cards: [] }))
      .then((d: { cards: ListingCardData[] }) => setCards(d.cards))
      .catch(() => {});
    return () => ctl.abort();
  }, [ids]);

  if (cards.length === 0) return null;
  return (
    <section aria-labelledby="recent-title" className="flex flex-col gap-4">
      <h2 id="recent-title" className="text-h3 text-ink">
        {t.recent.title}
      </h2>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <ListingCard key={c.id} listing={c} ctx={ctx} />
        ))}
      </div>
    </section>
  );
}
