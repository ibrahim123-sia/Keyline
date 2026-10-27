import { z } from "zod";

/**
 * A monthly figure an admin enters for price trends (11 §7, source `admin_entered`), e.g.
 * from a public market report. Typed per the market's area unit and rent period, in the base
 * currency's major units; stored per m² (rents per year) in minor units. Client-safe.
 */
export const priceFigureSchema = z.strictObject({
  id: z.uuid().nullable().default(null),
  locationId: z.uuid(),
  /** "2026-09" */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose the month"),
  purpose: z.enum(["sale", "rent"]),
  propertyTypeId: z.uuid().nullable().default(null),
  /** Median price per area unit (rents per the market's rent period), major units. */
  median: z.number({ error: "Enter the median" }).positive("Enter the median").max(1e9),
  listingsCount: z.number().int().min(0).max(1_000_000).nullable().default(null),
  sourceNote: z
    .string()
    .trim()
    .min(3, "Say where the figure comes from")
    .max(300, "Use at most 300 characters"),
});
export type PriceFigureInput = z.input<typeof priceFigureSchema>;

/** A figure as the editor shows it (agency data read-only, entered figures editable). */
export type PriceFigureRow = {
  id: string;
  month: string;
  purpose: "sale" | "rent";
  propertyTypeId: string | null;
  source: "agency_data" | "admin_entered";
  /** Major units per the market's area unit (rents per the market's period). */
  median: number;
  listingsCount: number;
  dealsCount: number;
  sourceNote: string | null;
};
