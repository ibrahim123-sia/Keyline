"use client";

import { getStored } from "@/lib/stored";

/**
 * A save a guest started (12 §1): kept in this browser while they sign in or sign up (the
 * verification email may open a new tab, so not sessionStorage), then finished on the page
 * they came from.
 */
export type PendingAction =
  | { kind: "save-home"; propertyId?: string; projectId?: string }
  | { kind: "save-search"; query: string; name: string };

const KEY = "propel.pending";
const DAY = 86_400_000;

export function setPending(action: PendingAction) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ action, path: window.location.pathname, at: Date.now() }),
    );
  } catch {
    /* private mode: they save again after signing in */
  }
}

/** The pending action for this page, removed once taken. */
export function takePending(): PendingAction | null {
  try {
    const raw = getStored(localStorage, KEY);
    if (!raw) return null;
    const { action, path, at } = JSON.parse(raw) as {
      action: PendingAction;
      path: string;
      at: number;
    };
    if (Date.now() - at > DAY) {
      localStorage.removeItem(KEY);
      return null;
    }
    if (path !== window.location.pathname) return null;
    localStorage.removeItem(KEY);
    return action;
  } catch {
    return null;
  }
}

/** Where to go back to after signing in or up. */
export const returnPath = () => `${window.location.pathname}${window.location.search}`;
