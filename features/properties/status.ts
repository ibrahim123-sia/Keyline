import type { PropertyStatus } from "@/db/schema/properties";

/**
 * Listing visibility (07 §3): a draft is private; publishing moves it to "available".
 * Sold and rented listings leave search but keep their page; "off market" hides the page.
 */
export const liveStatuses = [
  "available",
  "reserved",
  "under_offer",
  "sold",
  "rented",
] as const satisfies readonly PropertyStatus[];

/** Shown in search results, on maps and in alerts. */
export const searchableStatuses = [
  "available",
  "reserved",
  "under_offer",
] as const satisfies readonly PropertyStatus[];

export const isLiveStatus = (status: PropertyStatus): boolean =>
  (liveStatuses as readonly PropertyStatus[]).includes(status);

export const statusLabels: Record<PropertyStatus, string> = {
  draft: "Draft",
  available: "Available",
  reserved: "Reserved",
  under_offer: "Under offer",
  sold: "Sold",
  rented: "Rented",
  off_market: "Off market",
};
