import { z } from "zod";
import { projectStatuses, type ProjectStatus } from "@/db/schema/projects";
import { paymentPlanInputSchema } from "@/features/payment-plans/schema";
import { listingMediaSchema } from "@/features/properties/schema";
import { optionalHttpUrl, seoInputSchema } from "@/features/seo/schema";
import { richDocSchema } from "@/lib/rich-text";
import { lngLatSchema } from "@/lib/schemas";
import { SLUG_RE } from "@/lib/slug";

/**
 * Projects (07 §6, 05 §4): off-plan developments with unit types and a payment plan that
 * their listings inherit. Stored units only: money in minor units, areas in m².
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

export const projectStatusLabels: Record<ProjectStatus, string> = {
  announced: "Announced",
  under_construction: "Under construction",
  completed: "Completed",
};

export const unitTypeSchema = z
  .object({
    /** Kept across saves: listings point at unit types. New rows get an id in the browser. */
    id: z.uuid(),
    name: text(80).min(1, "Name the unit type"),
    beds: count(50),
    baths: count(50),
    sizeMin: area,
    sizeMax: area,
    priceFrom: minor,
    floorPlanId: z.uuid().nullable(),
    availableCount: count(100_000),
  })
  .strict()
  .refine((u) => u.sizeMin == null || u.sizeMax == null || u.sizeMin <= u.sizeMax, {
    path: ["sizeMax"],
    message: "The largest size must be at least the smallest",
  });

export type UnitTypeInput = z.infer<typeof unitTypeSchema>;

export const projectInputSchema = z
  .object({
    // Basics
    name: text(120).min(1, "Enter the project's name"),
    developerId: z.uuid().nullable(),
    locationId: z.uuid().nullable(),
    point: lngLatSchema.nullable(),
    status: z.enum(projectStatuses),
    isFeatured: z.boolean(),
    // Dates and progress
    launchDate: date,
    handoverDate: date,
    /** When only a quarter is known: "Q4 2027". */
    handoverText: text(40),
    constructionProgress: count(100),
    // Pricing
    startingPrice: minor,
    currency: z.string().regex(/^[A-Z]{3}$/, "Use the three-letter currency code"),
    totalUnits: count(100_000),
    unitTypesSummary: text(200),
    // Content
    description: richDocSchema.nullable(),
    highlights: z.array(z.string().trim().min(1).max(120)).max(12, "Use at most 12 highlights"),
    // Media
    media: z.array(listingMediaSchema).max(150),
    masterPlanId: z.uuid().nullable(),
    brochureId: z.uuid().nullable(),
    videoUrl: optionalHttpUrl(),
    tourUrl: optionalHttpUrl(),
    // Facilities, unit types, plan
    facilityIds: z.array(z.uuid()).max(300),
    unitTypes: z.array(unitTypeSchema).max(100, "Use at most 100 unit types"),
    paymentPlan: paymentPlanInputSchema.nullable(),
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

export type ProjectInput = z.infer<typeof projectInputSchema>;

export const newProjectSchema = z
  .object({
    name: text(120).min(1, "Enter the project's name"),
    developerId: z.uuid("Choose the developer"),
    locationId: z.uuid("Choose the location"),
  })
  .strict();

/* Publish rules (07 §6) ----------------------------------------------------- */

export type ProjectSection =
  | "basics"
  | "dates"
  | "pricing"
  | "description"
  | "media"
  | "facilities"
  | "units"
  | "plan"
  | "nearby"
  | "seo"
  | "listings"
  | "activity";

export type ProjectProblem = { field: string; section: ProjectSection; message: string };

export function projectPublishProblems(
  p: ProjectInput,
  ctx: {
    /** Alt text of each photo in the library, used when the project has none of its own. */
    libraryAlt: ReadonlyMap<string, string | null>;
    /** Problem with the attached plan (from planProblem), or null. */
    planProblem: string | null;
  },
): ProjectProblem[] {
  const problems: ProjectProblem[] = [];
  const add = (field: string, section: ProjectSection, message: string) =>
    problems.push({ field, section, message });
  if (!p.name) add("name", "basics", "Add the project's name.");
  if (!p.developerId) add("developerId", "basics", "Choose the developer.");
  if (!p.locationId) add("locationId", "basics", "Choose the location.");
  if (!p.point) add("point", "basics", "Drop the pin on the map.");
  const photos = p.media.filter((m) => m.kind === "photo");
  if (photos.length === 0) add("media", "media", "Add at least one photo.");
  else if (!photos.some((m) => m.alt || ctx.libraryAlt.get(m.mediaId)))
    add("media", "media", "Describe at least one photo (alt text).");
  if (p.paymentPlan && ctx.planProblem) add("paymentPlan", "plan", ctx.planProblem);
  return problems;
}

/** "Studio–3 bed" style hint from the unit types, for the summary field. */
export function suggestUnitSummary(units: ReadonlyArray<Pick<UnitTypeInput, "beds">>): string {
  const beds = units.map((u) => u.beds).filter((b): b is number => b != null);
  if (beds.length === 0) return "";
  const label = (b: number) => (b === 0 ? "Studio" : `${b} bed`);
  const min = Math.min(...beds);
  const max = Math.max(...beds);
  return min === max ? label(min) : `${label(min)} to ${max} bed`;
}

/** Lowest "price from" of the unit types (minor units), or null. */
export function lowestUnitPrice(
  units: ReadonlyArray<Pick<UnitTypeInput, "priceFrom">>,
): number | null {
  const prices = units.map((u) => u.priceFrom).filter((p): p is number => p != null);
  return prices.length ? Math.min(...prices) : null;
}

export const createListingsSchema = z
  .object({
    projectId: z.uuid(),
    propertyTypeId: z.uuid("Choose a property type"),
    items: z
      .array(
        z
          .object({
            unitTypeId: z.uuid(),
            count: z.number().int().min(1, "At least 1").max(20, "At most 20 at a time"),
          })
          .strict(),
      )
      .min(1, "Choose at least one unit type")
      .max(100),
  })
  .strict();
