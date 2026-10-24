import { z } from "zod";
import { valuation as t } from "@/lib/i18n/dictionaries/valuation";

/**
 * The owner forms (11 §5-6): the free valuation and "list your property" share their steps;
 * listing adds the asking price and the date it is free. Checked in the browser step by step
 * and again on the server. Client-safe.
 */

export const ownerConditions = ["needs_work", "good", "excellent", "renovated"] as const;
export type OwnerCondition = (typeof ownerConditions)[number];

export const ownerUpgrades = [
  "kitchen",
  "bathrooms",
  "flooring",
  "smart_home",
  "extension",
  "outdoor",
] as const;
export type OwnerUpgrade = (typeof ownerUpgrades)[number];

/** Photos a visitor can add to one request, and their size limit. */
export const OWNER_PHOTO_LIMIT = 8;
export const OWNER_PHOTO_MAX_MB = 10;

const text = (max: number) => z.string().trim().max(max, `Use at most ${max} characters`);

const fields = {
  purpose: z.enum(["sell", "rent"], { error: t.errors.purpose }),
  locationId: z.uuid({ error: t.errors.area }),
  building: text(120).default(""),
  propertyTypeId: z.uuid({ error: t.errors.type }),
  /** 0 = studio; null for types without bedrooms (checked against the type on the server). */
  beds: z.number().int().min(0).max(20).nullable().default(null),
  baths: z.number().int().min(0).max(20).nullable().default(null),
  /** In the market's area unit (Settings -> Market); stored in m². */
  size: z
    .number({ error: t.errors.size })
    .positive(t.errors.size)
    .max(1_000_000, t.errors.sizeRange),
  condition: z.enum(ownerConditions).nullable().default(null),
  upgrades: z.array(z.enum(ownerUpgrades)).max(ownerUpgrades.length).default([]),
  /** Receipts from the photo upload (features/valuation/photos.ts). */
  photos: z.array(z.string().max(1000)).max(OWNER_PHOTO_LIMIT).default([]),
  name: z.string().trim().min(2, t.errors.name).max(80, "Use at most 80 characters"),
  email: z.union([z.email(t.errors.email).max(160, t.errors.email), z.literal("")]).default(""),
  phone: text(30).default(""),
  notes: text(2000).default(""),
  consent: z.literal(true, { error: t.errors.consent }),
  marketing: z.boolean().default(false),
  /** Honeypot: hidden from people, filled in by bots. */
  website: z.string().max(200).default(""),
  captchaToken: z.string().max(4000).nullable().default(null),
};

const listingFields = {
  /** Major units of the base currency; rents per the market's rent period. */
  askingPrice: z
    .number({ error: t.errors.price })
    .positive(t.errors.price)
    .max(1e12)
    .nullable()
    .default(null),
  availableFrom: z.union([z.iso.date({ error: t.errors.date }), z.literal("")]).default(""),
};

const reachable = (v: { email: string; phone: string }, ctx: z.RefinementCtx) => {
  if (!v.email && !v.phone)
    ctx.addIssue({ code: "custom", path: ["email"], message: t.errors.reach });
};

export const valuationRequestSchema = z.strictObject(fields).superRefine(reachable);
export type ValuationRequestInput = z.input<typeof valuationRequestSchema>;
export type ValuationRequestData = z.output<typeof valuationRequestSchema>;

export const listingRequestSchema = z
  .strictObject({ ...fields, ...listingFields })
  .superRefine(reachable);
export type ListingRequestInput = z.input<typeof listingRequestSchema>;
export type ListingRequestData = z.output<typeof listingRequestSchema>;

export type OwnerRequestKind = "valuation" | "listing";

/** The steps of both forms (11 §5) and the fields each one checks before moving on. */
export const ownerSteps = [
  { key: "purpose", fields: ["purpose"] },
  { key: "location", fields: ["locationId", "building"] },
  {
    key: "home",
    fields: [
      "propertyTypeId",
      "beds",
      "baths",
      "size",
      "condition",
      "upgrades",
      "askingPrice",
      "availableFrom",
    ],
  },
  { key: "photos", fields: ["photos"] },
  { key: "contact", fields: ["name", "email", "phone", "notes", "consent", "marketing"] },
] as const;
export type OwnerStepKey = (typeof ownerSteps)[number]["key"];

/** The upload request for one photo (step 4). */
export const ownerPhotoUploadSchema = z.strictObject({
  fileName: z.string().trim().min(1).max(200),
  size: z
    .number()
    .int()
    .positive()
    .max(OWNER_PHOTO_MAX_MB * 1024 * 1024),
});

/** What the result screen shows (11 §5). Amounts are minor units of `currency`. */
export type OwnerRequestResult = {
  kind: OwnerRequestKind;
  agentName: string;
  areaName: string;
  email: string | null;
  estimate:
    | {
        status: "estimate";
        low: number;
        mid: number;
        high: number;
        currency: string;
        /** Rents: the period the amounts are per. */
        period: "year" | "month" | null;
        comparables: Array<{
          id: string;
          title: string;
          slug: string;
          beds: number | null;
          /** m² */
          size: number;
          price: number;
          status: string;
          locationName: string | null;
        }>;
      }
    | { status: "not_enough_data" }
    | null;
};
