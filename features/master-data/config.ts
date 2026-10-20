import { z } from "zod";
import {
  badgeAutoRules,
  facilityGroups,
  hideableFields,
  poiCategories,
  propertyCategories,
} from "@/db/schema/master-data";
import { contrastRatio } from "@/lib/contrast";
import { SLUG_RE } from "@/lib/slug";

/** The simple master data types managed by the generic Setup screen (07 §1). */
export const masterKinds = ["property-types", "facilities", "badges", "poi-types"] as const;
export type MasterKind = (typeof masterKinds)[number];

const name = z.string().trim().min(1, "Enter a name").max(60);
const icon = z.string().trim().max(40).nullable();
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour");

export const masterSchemas = {
  "property-types": z.object({
    name,
    slug: z
      .string()
      .trim()
      .regex(SLUG_RE, "Lowercase letters, numbers and hyphens")
      .max(80)
      .or(z.literal("")),
    pluralName: z.string().trim().max(60),
    category: z.enum(propertyCategories),
    icon,
    fieldsHidden: z.array(z.enum(hideableFields)).max(hideableFields.length),
  }),
  facilities: z.object({ name, icon, group: z.enum(facilityGroups) }),
  badges: z
    .object({
      name: z.string().trim().min(1, "Enter a name").max(30),
      color: hex,
      textColor: hex,
      icon,
      autoRule: z.enum(badgeAutoRules),
      autoDays: z.number().int().min(1).max(365).nullable(),
    })
    .refine((b) => contrastRatio(b.textColor, b.color) >= 4.5, {
      message: "Text and background need at least 4.5:1 contrast",
      path: ["textColor"],
    }),
  "poi-types": z.object({
    name,
    icon,
    category: z.enum(poiCategories),
    googlePlaceType: z.string().trim().max(60).nullable(),
    defaultSearchRadiusM: z.number().int().min(100).max(50_000),
    showOnProperty: z.boolean(),
    travelMode: z.enum(["drive", "walk"]),
  }),
} satisfies Record<MasterKind, z.ZodType>;

export type MasterInput<K extends MasterKind> = z.infer<(typeof masterSchemas)[K]>;

export const masterLabels: Record<
  MasterKind,
  { title: string; singular: string; description: string }
> = {
  "property-types": {
    title: "Property types",
    singular: "property type",
    description: "Apartments, villas, offices… Land hides beds and baths; commercial hides beds.",
  },
  facilities: {
    title: "Facilities",
    singular: "facility",
    description:
      "Amenities shown on listings and projects, grouped by building, unit and community.",
  },
  badges: {
    title: "Badges",
    singular: "badge",
    description: "Labels on listing cards. Automatic badges are added and removed by rules.",
  },
  "poi-types": {
    title: "POI types",
    singular: "POI type",
    description: "Kinds of nearby places measured for each listing (schools, metro, malls…).",
  },
};

export function isMasterKind(value: string): value is MasterKind {
  return (masterKinds as readonly string[]).includes(value);
}
