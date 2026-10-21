"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CardContext } from "@/components/site/listings/listing-card";
import { useHydrated } from "@/lib/use-hydrated";

const KEY = "lintel.recent";
const MAX = 12;

// The cards (and the listing card code) load only when the section is about to be seen.
const RecentlyViewedCards = dynamic(
  () => import("./recently-viewed-cards").then((m) => m.RecentlyViewedCards),
  { ssr: false },
);

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
  const hydrated = useHydrated();
  // Read before this visit is remembered below (render runs before effects).
  const ids = useMemo(
    () =>
      hydrated
        ? readIds()
            .filter((id) => id !== currentId)
            .slice(0, 6)
        : [],
    [hydrated, currentId],
  );
  const [near, setNear] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const others = readIds().filter((id) => id !== currentId);
    try {
      localStorage.setItem(KEY, JSON.stringify([currentId, ...others].slice(0, MAX)));
    } catch {
      /* private mode: nothing remembered */
    }
  }, [currentId]);

  useEffect(() => {
    const el = anchor.current;
    if (ids.length === 0 || near || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ids, near]);

  if (ids.length === 0) return null;
  return <div ref={anchor}>{near && <RecentlyViewedCards ids={ids} ctx={ctx} />}</div>;
}
