"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { VisitorEventType } from "@/db/schema/crm";

export type TrackEvent = {
  type: VisitorEventType;
  entityType?: "property" | "project" | "page" | "post" | "area_guide" | "agent" | "developer";
  entityId?: string;
  meta?: Record<string, string | number | boolean | null>;
};

/** Sends one event to /api/track without holding up the page (09 §2 "Journey"). */
export function track(
  event: TrackEvent & { landing?: { search: string; referrer: string | null } },
): void {
  try {
    const body = JSON.stringify({ path: window.location.pathname, ...event });
    if (navigator.sendBeacon?.("/api/track", body)) return;
    void fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {
    // Tracking never breaks the page.
  }
}

// Module state, so a re-mounted tracker (React strict mode, layouts) never counts twice.
let lastPath: string | null = null;
let landed = false;

/**
 * A page view on every navigation; the first one after a full page load is the landing and
 * carries the campaign data and referrer (first and last touch, 09 §2).
 */
export function VisitorTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === lastPath) return;
    lastPath = pathname;
    const landing = landed
      ? undefined
      : { search: window.location.search, referrer: document.referrer || null };
    landed = true;
    track({ type: "page_view", landing });
  }, [pathname]);
  return null;
}

let lastView: { id: string; at: number } | null = null;

/** Counts one view of a listing (its daily views, and the visitor's journey). */
export function TrackListingView({ propertyId }: { propertyId: string }) {
  useEffect(() => {
    // Strict mode mounts twice in a row; a real second view comes later.
    if (lastView?.id === propertyId && Date.now() - lastView.at < 2000) return;
    lastView = { id: propertyId, at: Date.now() };
    track({ type: "listing_view", entityType: "property", entityId: propertyId });
  }, [propertyId]);
  return null;
}
