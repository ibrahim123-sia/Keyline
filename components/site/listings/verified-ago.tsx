"use client";

import { useSyncExternalStore } from "react";

/** "Verified today", "Verified 3 days ago" (02 §1 "trust is visible"). */
export function verifiedLabel(iso: string, now: number): string {
  const days = Math.max(0, Math.floor((now - Date.parse(iso)) / 86_400_000));
  if (days === 0) return "Verified today";
  if (days === 1) return "Verified yesterday";
  if (days < 60) return `Verified ${days} days ago`;
  return `Verified ${Math.round(days / 30)} months ago`;
}

const onDate = (iso: string) =>
  `Verified ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso))}`;

// The time the page started in the browser: read once, outside rendering.
let pageNow: number | null = null;
const subscribe = () => () => {};
const clientNow = () => (pageNow ??= Date.now());
const serverNow = () => null;

/**
 * The verified date, relative once the page is running in the browser. The server renders
 * the date itself: cards are cached and prerendered, where the clock must not be read
 * (Cache Components), and the same text hydrates without a mismatch.
 */
export function VerifiedAgo({ iso }: { iso: string }) {
  const now = useSyncExternalStore(subscribe, clientNow, serverNow);
  return <>{now === null ? onDate(iso) : verifiedLabel(iso, now)}</>;
}
