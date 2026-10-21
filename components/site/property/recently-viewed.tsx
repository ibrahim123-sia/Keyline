"use client";

import { useEffect, useState } from "react";
import { ListingCard, type CardContext } from "@/components/site/listings/listing-card";
import type { ListingCardData } from "@/features/listings/cards";
import { property as t } from "@/lib/i18n/dictionaries/property";

const KEY = "lintel.recent";
const MAX = 12;

function readIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Recently viewed (06 §5.16): kept in this browser only, never on the server. This listing is
 * remembered first; the others are shown with their current card data.
 */
export function RecentlyViewed({ currentId, ctx }: { currentId: string; ctx: CardContext }) {
  const [cards, setCards] = useState<ListingCardData[]>([]);
  useEffect(() => {
    const others = readIds().filter((id) => id !== currentId);
    try {
      localStorage.setItem(KEY, JSON.stringify([currentId, ...others].slice(0, MAX)));
    } catch {
      /* private mode: nothing remembered */
    }
    const ids = others.slice(0, 6);
    if (ids.length === 0) return;
    const ctl = new AbortController();
    fetch(`/api/listings/cards?ids=${ids.join(",")}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : { cards: [] }))
      .then((d: { cards: ListingCardData[] }) => setCards(d.cards))
      .catch(() => {});
    return () => ctl.abort();
  }, [currentId]);

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
