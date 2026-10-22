"use client";

import { useEffect, type ReactNode } from "react";

function beacon(url: string, body: string) {
  try {
    if (!navigator.sendBeacon?.(url, body))
      void fetch(url, { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {
    // Counting never gets in the way of the page.
  }
}

// Module state, so a re-mounted page (React strict mode) counts one open.
const opened = new Set<string>();

/** Counts one open of the shortlist once it has loaded in a browser (09 §4 "opens"). */
export function ShortlistOpened({ token }: { token: string }) {
  useEffect(() => {
    if (opened.has(token)) return;
    opened.add(token);
    beacon(`/api/shortlists/${token}/open`, "{}");
  }, [token]);
  return null;
}

/** Wraps a card on a shortlist page: opening the home is counted for the agent (09 §4). */
export function ShortlistCard({
  token,
  propertyId,
  children,
}: {
  token: string;
  propertyId: string;
  children: ReactNode;
}) {
  return (
    <div
      onClickCapture={() => beacon(`/api/shortlists/${token}/view`, JSON.stringify({ propertyId }))}
    >
      {children}
    </div>
  );
}
