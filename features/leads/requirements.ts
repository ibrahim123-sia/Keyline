import type { Requirements } from "@/db/schema/crm";

/** What a lead is looking for: filled from listings and later answers. Pure. */

/** Fills what the visitor did not say from the listing they asked about (09 §3.3). */
export function enrichRequirements(
  base: Requirements,
  listing: {
    purpose: "sale" | "rent";
    locationId: string | null;
    propertyTypeId: string | null;
    beds: number | null;
    price: number | null;
    currency: string | null;
  } | null,
  projectLocationId: string | null = null,
): Requirements {
  const r: Requirements = { ...base };
  if (listing) {
    r.purpose ??= listing.purpose;
    if (!r.locationIds?.length && listing.locationId) r.locationIds = [listing.locationId];
    if (!r.propertyTypeIds?.length && listing.propertyTypeId)
      r.propertyTypeIds = [listing.propertyTypeId];
    if (r.bedsMin == null && listing.beds != null) r.bedsMin = listing.beds;
    // A price band around the asked-about home: 15% either side.
    if (r.budgetMin == null && r.budgetMax == null && listing.price) {
      r.budgetMin = Math.round(listing.price * 0.85);
      r.budgetMax = Math.round(listing.price * 1.15);
      r.currency ??= listing.currency ?? undefined;
      r.budgetFrom = "listing";
    }
  }
  if (!r.locationIds?.length && projectLocationId) r.locationIds = [projectLocationId];
  return r;
}

/** Later answers fill gaps; they never wipe what the lead already said. */
export function mergeRequirements(current: Requirements, next: Requirements): Requirements {
  const merged: Requirements = { ...current };
  // A budget the lead states replaces one worked out from a listing.
  if (next.budgetFrom === "lead" && current.budgetFrom !== "lead") {
    merged.budgetMin = next.budgetMin ?? null;
    merged.budgetMax = next.budgetMax ?? null;
    merged.currency = next.currency ?? merged.currency;
    merged.budgetFrom = "lead";
  }
  for (const [k, v] of Object.entries(next) as Array<[keyof Requirements, unknown]>) {
    const empty =
      merged[k] === undefined ||
      merged[k] === null ||
      merged[k] === "" ||
      (Array.isArray(merged[k]) && (merged[k] as unknown[]).length === 0);
    if (empty && v !== undefined && v !== null && v !== "")
      (merged as Record<string, unknown>)[k] = v;
  }
  return merged;
}
