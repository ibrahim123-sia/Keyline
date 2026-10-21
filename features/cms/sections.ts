import { z } from "zod";
import { richDocSchema } from "@/lib/rich-text";

/**
 * Page sections (08 §1): each stored as `{ id, type, props, style }` in `pages.sections`.
 * Phase 4 renders the home page's sections; the page builder (Phase 5) edits them and adds
 * the remaining types. Invalid or unknown sections are skipped on the site, never fatal.
 */

const text = (max: number) => z.string().trim().max(max).default("");
const id = z.uuid();

/** Internal paths ("/buy?beds=2") or full https/http links. */
const href = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => v === "" || v.startsWith("/") || /^https?:\/\//.test(v),
    "Use a path like /buy or a full link",
  );

const button = z.object({ label: text(40), href }).strict();

export const sectionStyleSchema = z
  .object({
    background: z.enum(["sand", "white", "soft", "ink", "image"]).default("white"),
    backgroundImageId: id.nullable().default(null),
    spacing: z.enum(["compact", "normal", "large"]).default("normal"),
    width: z.enum(["contained", "full"]).default("contained"),
    anchor: z
      .string()
      .regex(/^[a-z0-9-]*$/, "Lowercase letters, numbers and hyphens")
      .max(40)
      .default(""),
    hideOn: z.enum(["none", "phone", "desktop"]).default("none"),
  })
  .strict();

export type SectionStyle = z.infer<typeof sectionStyleSchema>;

const propsByType = {
  hero_search: z
    .object({
      eyebrow: text(60),
      heading: text(120),
      subheading: text(240),
      tabs: z
        .array(z.enum(["buy", "rent", "off_plan"]))
        .min(1)
        .max(3)
        .default(["buy", "rent", "off_plan"]),
      defaultTab: z.enum(["buy", "rent", "off_plan"]).default("buy"),
      imageId: id.nullable().default(null),
      floatingBadge: z.boolean().default(true),
      floatingBadgeText: text(60),
    })
    .strict(),
  hero_simple: z
    .object({
      heading: text(120),
      subheading: text(240),
      imageId: id.nullable().default(null),
      buttons: z.array(button).max(2).default([]),
    })
    .strict(),
  promise_strip: z
    .object({
      items: z
        .array(z.object({ title: text(60), text: text(200), icon: text(40) }).strict())
        .min(2)
        .max(4),
    })
    .strict(),
  featured_listings: z
    .object({
      eyebrow: text(60),
      heading: text(120),
      source: z.enum(["featured", "newest", "manual", "filter"]).default("featured"),
      listingIds: z.array(id).max(12).default([]),
      /** For "filter": a search query string, e.g. "type=villas&max=5000000". */
      filter: z.string().max(500).default(""),
      count: z.number().int().min(3).max(12).default(6),
      viewAll: button.nullable().default(null),
    })
    .strict(),
  projects_showcase: z
    .object({
      eyebrow: text(60),
      heading: text(120),
      source: z.enum(["featured", "manual", "area"]).default("featured"),
      projectIds: z.array(id).max(8).default([]),
      locationId: id.nullable().default(null),
      count: z.number().int().min(1).max(8).default(4),
      dark: z.boolean().default(true),
      viewAll: button.nullable().default(null),
    })
    .strict(),
  areas_grid: z
    .object({
      eyebrow: text(60),
      heading: text(120),
      source: z.enum(["featured", "manual"]).default("featured"),
      locationIds: z.array(id).max(12).default([]),
      count: z.number().int().min(2).max(12).default(4),
    })
    .strict(),
  text: z
    .object({ body: richDocSchema, maxWidth: z.enum(["narrow", "normal"]).default("narrow") })
    .strict(),
  stats: z
    .object({
      heading: text(120),
      // Admin-entered only, each with where the number comes from (08 §1).
      items: z
        .array(z.object({ value: text(20), label: text(60), source: text(120) }).strict())
        .min(1)
        .max(6),
    })
    .strict(),
  cta: z
    .object({ heading: text(120), text: text(300), buttons: z.array(button).max(2).default([]) })
    .strict(),
} as const;

export type SectionType = keyof typeof propsByType;
export const sectionTypes = Object.keys(propsByType) as SectionType[];

export type Section = {
  [T in SectionType]: {
    id: string;
    type: T;
    props: z.infer<(typeof propsByType)[T]>;
    style: SectionStyle;
  };
}[SectionType];

/** One stored section, or null when it is unknown or invalid (the site skips it). */
export function parseSection(raw: unknown): Section | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as { id?: unknown; type?: unknown; props?: unknown; style?: unknown };
  if (typeof s.id !== "string" || typeof s.type !== "string" || !(s.type in propsByType))
    return null;
  const props = propsByType[s.type as SectionType].safeParse(s.props ?? {});
  const style = sectionStyleSchema.safeParse(s.style ?? {});
  if (!props.success || !style.success) return null;
  return { id: s.id, type: s.type, props: props.data, style: style.data } as Section;
}

/** Strict validation for saving (the page builder, the seed). */
export function sectionInputSchema() {
  return z.discriminatedUnion(
    "type",
    sectionTypes.map((type) =>
      z
        .object({
          id: z.string().min(1).max(64),
          type: z.literal(type),
          props: propsByType[type],
          style: sectionStyleSchema.default(sectionStyleSchema.parse({})),
        })
        .strict(),
    ) as unknown as [z.ZodObject, ...z.ZodObject[]],
  );
}
