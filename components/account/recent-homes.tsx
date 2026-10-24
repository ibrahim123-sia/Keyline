"use client";

import { useSyncExternalStore } from "react";
import type { CardContext } from "@/components/site/listings/listing-card";
import { RecentlyViewedCards } from "@/components/site/property/recently-viewed-cards";

const read = () => {
  try {
    const raw = JSON.parse(localStorage.getItem("keyline.recent") ?? "[]");
    return Array.isArray(raw)
      ? (raw.filter((x) => typeof x === "string").slice(0, 6) as string[])
      : [];
  } catch {
    return [];
  }
};
let cache: { raw: string | null; ids: string[] } = { raw: null, ids: [] };
const snapshot = () => {
  const raw = typeof localStorage === "undefined" ? null : localStorage.getItem("keyline.recent");
  if (raw !== cache.raw) cache = { raw, ids: read() };
  return cache.ids;
};
const empty: string[] = [];

/** Recently viewed homes on the overview (kept in this browser only, 06 §5.16). */
export function RecentHomes({ ctx }: { ctx: CardContext }) {
  const ids = useSyncExternalStore(
    () => () => {},
    snapshot,
    () => empty,
  );
  if (ids.length === 0) return null;
  return <RecentlyViewedCards ids={ids} ctx={ctx} />;
}
