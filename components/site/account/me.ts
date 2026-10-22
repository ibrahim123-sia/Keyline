"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * What this browser has saved (12): one /api/me request per page, after the page has loaded,
 * shared by every heart, compare button and the compare tray.
 */
export type Me = {
  signedIn: boolean;
  saved: { properties: string[]; projects: string[] };
  compare: string[];
};

let state: Me | null = null;
let loading: Promise<Me | null> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setMe(next: Me) {
  state = next;
  emit();
}

export function patchMe(patch: (me: Me) => Me) {
  if (state) setMe(patch(state));
}

/** Loads once; waits for the page's load event so it never competes with the first paint. */
export function loadMe(): Promise<Me | null> {
  if (state) return Promise.resolve(state);
  loading ??= new Promise<void>((resolve) => {
    if (document.readyState === "complete") resolve();
    else window.addEventListener("load", () => resolve(), { once: true });
  })
    .then(() => fetch("/api/me", { credentials: "same-origin" }))
    .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
    .then((me) => {
      if (me) setMe(me);
      return me;
    })
    .catch(() => null);
  return loading;
}

/** Fetches again (after signing in or out elsewhere). */
export function reloadMe(): Promise<Me | null> {
  state = null;
  loading = null;
  return loadMe();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useMe(): Me | null {
  const me = useSyncExternalStore(
    subscribe,
    () => state,
    () => null,
  );
  useEffect(() => {
    void loadMe();
  }, []);
  return me;
}
