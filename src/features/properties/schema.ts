import { z } from "zod";
import {
  pricePeriods,
  propertyCompletions,
  propertyPurposes,
  propertyStatuses,
} from "@/db/schema/properties";
import { listingMediaKinds } from "@/db/schema/projects";
import { paymentPlanInputSchema } from "@/features/payment-plans/schema";
import { optionalHttpUrl, seoInputSchema } from "@/features/seo/schema";
import { richDocSchema } from "@/lib/rich-text";
import { lngLatSchema } from "@/lib/schemas";
import { SLUG_RE } from "@/lib/slug";

/**
 * The listing editor's data (07 §3). Stored units only: money in minor units, areas in m².
 * A draft may be incomplete; publishing checks `publishProblems` (07 §3 publish rules).
 */

const minor = z
  .number()
  .int("Use a whole amount")
  .min(0, "Cannot be negative")
  .max(1e15, "That amount is too large")
  .nullable();
const area = z.number().positive("Must be more than 0").max(10_000_000).nullable();
const count = (max: number) => z.number().int("Use a whole number").min(0).max(max).nullable();
const text = (max: number) => z.string().trim().max(max);
const date = z.iso.date("Use a valid date").nullable();

export const listingMediaSchema = z
  .object({
    mediaId: z.uuid(),
    kind: z.enum(listingMediaKinds),
    isCover: z.boolean(),
    caption: text(200),
    alt: text(200),
  })
  .strict();

export type ListingMedia = z.infer<typeof listingMediaSchema>;

export const propertyInputSchema = z
  .object({
    // Basics
    purpose: z.enum(propertyPurposes),
    completion: z.enum(propertyCompletions),
    propertyTypeId: z.uuid().nullable(),
    title: text(120),
    agentId: z.uuid().nullable(),
    isFeatured: z.boolean(),
    featuredUntil: date,
    // Location
    locationId: z.uuid().nullable(),
    buildingName: text(120),
    addressLine: text(200),
    unitNumber: text(40),
    floor: text(20),
    point: lngLatSchema.nullable(),
    mapPinExact: z.boolean(),
    // Price
    price: minor,
    currency: z.string().regex(/^[A-Z]{3}$/, "Use the three-letter currency code"),
    priceOnRequest: z.boolean(),
    pricePeriod: z.enum(pricePeriods).nullable(),
    serviceChargePerArea: minor,
    rentPaymentOptions: z.array(z.number().int().min(1).max(12)).max(12),
    monthlyPaymentAvailable: z.boolean(),
    depositAmount: minor,
    agencyFeeText: text(200),
    // Specs
    beds: count(50),
    baths: count(50),
    size: area,
    plotSize: area,
    yearBuilt: z
      .number()
      .int()
      .min(1800, "Enter a year after 1800")
      .refine((y) => y <= new Date().getFullYear() + 10, "That year is too far ahead")
      .nullable(),
    parkingSpaces: count(100),
    furnishing: text(40),
    ownership: text(40),
    view: z.array(z.string().trim().min(1).max(40)).max(10),
    floorCount: count(300),
    maidRoom: z.boolean(),
    study: z.boolean(),
    // Off-plan
    projectId: z.uuid().nullable(),
    projectUnitTypeId: z.uuid().nullable(),
    handoverDate: date,
    /** When only a quarter is known: "Q4 2027". */
    handoverText: text(40),
    constructionProgress: count(100),
    /** The listing's own plan; null shows the project's plan, if any. */
    paymentPlan: paymentPlanInputSchema.nullable(),
    // Investment
    expectedRentYearly: minor,
    isTenanted: z.boolean(),
    tenancyEndDate: date,
    // Content
    description: richDocSchema.nullable(),
    highlights: z.array(z.string().trim().min(1).max(120)).max(12, "Use at most 12 highlights"),
    videoUrl: optionalHttpUrl(),
    tourUrl: optionalHttpUrl(),
    // Media, facilities, badges (manual ones; automatic badges are kept by the system)
    media: z.array(listingMediaSchema).max(150),
    facilityIds: z.array(z.uuid()).max(300),
    badgeIds: z.array(z.uuid()).max(30),
    // Trust
    permitNumber: text(60),
    isVerified: z.boolean(),
    lastVerifiedAt: z.iso.datetime({ offset: true }).nullable(),
    // SEO
    slug: z
      .string()
      .trim()
      .regex(SLUG_RE, "Lowercase letters, numbers and hyphens")
      .max(100)
      .or(z.literal("")),
  })
  .extend(seoInputSchema.shape)
  .strict();

export type PropertyInput = z.infer<typeof propertyInputSchema>;

export const newPropertySchema = z
  .object({
    purpose: z.enum(propertyPurposes),
    completion: z.enum(propertyCompletions),
    propertyTypeId: z.uuid("Choose a property type"),
    title: text(120),
  })
  .strict();

export const statusSchema = z.enum(propertyStatuses);

/* Publish rules (07 §3) ---------------------------------------------------- */

export type EditorSection =
  | "basics"
  | "location"
  | "price"
  | "specs"
  | "offplan"
  | "investment"
  | "description"
  | "media"
  | "facilities"
  | "badges"
  | "nearby"
  | "trust"
  | "seo"
  | "activity";

export type Problem = { field: string; section: EditorSection; message: string };

export type PublishContext = {
  /** Fields the property type hides (land hides beds and baths). */
  hiddenFields: readonly string[];
  permitRequired: boolean;
  permitLabel: string;
  /** Alt text of each photo in the library, used when the listing has none of its own. */
  libraryAlt: ReadonlyMap<string, string | null>;
  /** Problem with the attached plan (from planProblem), or null. */
  planProblem: string | null;
};

export function publishProblems(p: PropertyInput, ctx: PublishContext): Problem[] {
  const problems: Problem[] = [];
  const add = (field: string, section: EditorSection, message: string) =>
    problems.push({ field, section, message });
  const shown = (f: string) => !ctx.hiddenFields.includes(f);

  if (!p.title) add("title", "basics", "Add a title.");
  if (!p.propertyTypeId) add("propertyTypeId", "basics", "Choose the property type.");
  if (!p.locationId) add("locationId", "location", "Choose the location.");
  if (!p.point) add("point", "location", "Drop the pin on the map.");
  if (!p.priceOnRequest && !p.price)
    add("price", "price", "Add the price, or set price on request.");
  if (p.purpose === "rent" && !p.pricePeriod)
    add("pricePeriod", "price", "Choose whether the rent is per year or per month.");
  if (shown("beds") && p.beds == null) add("beds", "specs", "Add the number of bedrooms.");
  if (shown("baths") && p.baths == null) add("baths", "specs", "Add the number of bathrooms.");
  if (shown("size") && p.size == null) add("size", "specs", "Add the size.");
  const photos = p.media.filter((m) => m.kind === "photo");
  if (photos.length === 0) add("media", "media", "Add at least one photo.");
  else if (!photos.some((m) => m.alt || ctx.libraryAlt.get(m.mediaId)))
    add("media", "media", "Describe at least one photo (alt text).");
  if (ctx.permitRequired && !p.permitNumber)
    add("permitNumber", "trust", `Add the ${ctx.permitLabel.toLowerCase()}.`);
  if (p.paymentPlan && ctx.planProblem) add("paymentPlan", "offplan", ctx.planProblem);
  return problems;
}

/* Completeness score (07 §3, right panel) ---------------------------------- */

export type CompletenessItem = {
  key: string;
  label: string;
  done: boolean;
  section: EditorSection;
};

export type CompletenessInput = {
  photos: number;
  floorPlans: number;
  descriptionWords: number;
  facilities: number;
  poisComputed: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  permitNumber: string;
  /** False when the market has no permits: that point is left out. */
  permitsEnabled: boolean;
  lastVerifiedAt: Date | null;
  now: Date;
};

export function completeness(i: CompletenessInput): { score: number; items: CompletenessItem[] } {
  const verifiedRecently =
    i.lastVerifiedAt !== null && i.now.getTime() - i.lastVerifiedAt.getTime() <= 30 * 86_400_000;
  const items: CompletenessItem[] = [
    { key: "photos", label: "8 or more photos", done: i.photos >= 8, section: "media" },
    { key: "floorPlan", label: "A floor plan", done: i.floorPlans > 0, section: "media" },
    {
      key: "description",
      label: "Description of 120+ words",
      done: i.descriptionWords >= 120,
      section: "description",
    },
    {
      key: "facilities",
      label: "5 or more facilities",
      done: i.facilities >= 5,
      section: "facilities",
    },
    { key: "pois", label: "Nearby places measured", done: i.poisComputed, section: "nearby" },
    {
      key: "seo",
      label: "SEO title and description",
      done: Boolean(i.seoTitle && i.seoDescription),
      section: "seo",
    },
    ...(i.permitsEnabled
      ? [
          {
            key: "permit",
            label: "Permit number",
            done: Boolean(i.permitNumber),
            section: "trust" as const,
          },
        ]
      : []),
    {
      key: "verified",
      label: "Verified in the last 30 days",
      done: verifiedRecently,
      section: "trust",
    },
  ];
  const done = items.filter((x) => x.done).length;
  return { score: Math.round((done / items.length) * 100), items };
}
