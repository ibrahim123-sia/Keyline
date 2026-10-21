"use client";

import type { ReactNode } from "react";

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
      onClickCapture={() => {
        try {
          const body = JSON.stringify({ propertyId });
          const url = `/api/shortlists/${token}/view`;
          if (!navigator.sendBeacon?.(url, body))
            void fetch(url, { method: "POST", body, keepalive: true }).catch(() => {});
        } catch {
          // Counting never gets in the way of opening the home.
        }
      }}
    >
      {children}
    </div>
  );
}
