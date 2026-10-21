"use client";

import { useSyncExternalStore } from "react";
import { CONSENT_COOKIE, CONSENT_EVENT, parseConsent, type Consent } from "@/lib/consent";

function subscribe(onChange: () => void) {
  window.addEventListener(CONSENT_EVENT, onChange);
  return () => window.removeEventListener(CONSENT_EVENT, onChange);
}

/** The raw cookie value ("" when none). Strings compare by value, so the snapshot is stable. */
function snapshot(): string {
  for (const part of document.cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === CONSENT_COOKIE) return decodeURIComponent(v.join("="));
  }
  return "";
}

/** null while rendering on the server: the choice is only known in the browser. */
const serverSnapshot = () => null;

/** The visitor's cookie choice (null until they choose), kept up to date when it changes. */
export function useConsent(): { consent: Consent | null; known: boolean } {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return { consent: raw ? parseConsent(raw) : null, known: raw !== null };
}
