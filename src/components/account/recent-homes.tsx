"use client";

import { useSyncExternalStore } from "react";
import type { CardContext } from "@/components/site/listings/listing-card";
import { RecentlyViewedCards } from "@/components/site/property/recently-viewed-cards";
import { getStored } from "@/lib/stored";

const read = () => {
  try {
    const raw = JSON.parse(getStored(localStorage, "propel.recent") ?? "[]");
    return Array.isArray(raw)
      ? (raw.filter((x) => typeof x === "string").slice(0, 6) as string[])
      : [];
  } catch {
    return [];
  }
};
let cache: { raw: string | null; ids: string[] } = { raw: null, ids: [] };
const snapshot = () => {
  const raw = typeof localStorage === "undefined" ? null : getStored(localStorage, "propel.recent");
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
