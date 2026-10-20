import { z } from "zod";
import { locationLevels, type LocationLevel } from "@/db/schema/master-data";
import { SLUG_RE } from "@/lib/slug";

export const levelRank: Record<LocationLevel, number> = {
  country: 0,
  city: 1,
  area: 2,
  community: 3,
  building: 4,
};

export const levelLabels: Record<LocationLevel, string> = {
  country: "Country",
  city: "City",
  area: "Area",
  community: "Community",
  building: "Building",
};

const lngLat = z.object({ lng: z.number().min(-180).max(180), lat: z.number().min(-90).max(90) });
const ring = z
  .array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]))
  .min(4)
  .max(5000);
const polygonCoords = z.array(ring).min(1).max(50);

export const geoPolygonSchema = z.union([
  z.object({ type: z.literal("Polygon"), coordinates: polygonCoords }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(polygonCoords).min(1).max(50) }),
]);

/** SEO block fields (05 "SEO-able tables"); the full panel with AI suggestions lands in Phase 5. */
export const seoInputSchema = z.object({
  seoTitle: z.string().trim().max(120).nullable(),
  seoDescription: z.string().trim().max(320).nullable(),
  canonicalUrl: z.union([z.url(), z.literal("")]).nullable(),
  noindex: z.boolean(),
  ogImageId: z.uuid().nullable(),
});

export const locationInputSchema = z
  .object({
    parentId: z.uuid().nullable(),
    level: z.enum(locationLevels),
    name: z.string().trim().min(1, "Enter a name").max(100),
    slug: z
      .string()
      .trim()
      .regex(SLUG_RE, "Lowercase letters, numbers and hyphens")
      .max(80)
      .or(z.literal("")),
    center: lngLat.nullable(),
    geom: geoPolygonSchema.nullable(),
    description: z.string().trim().max(2000).nullable(),
    isFeatured: z.boolean(),
  })
  .extend(seoInputSchema.shape)
  .strict();

export type LocationInput = z.infer<typeof locationInputSchema>;

/** A child must be a deeper level than its parent (country > city > area > community > building). */
export function validParentLevel(parent: LocationLevel | null, child: LocationLevel): boolean {
  return parent === null ? true : levelRank[child] > levelRank[parent];
}

/** True when `candidateParentId` is `id` itself or one of its descendants (would create a cycle). */
export function wouldCycle(
  id: string,
  candidateParentId: string | null,
  parentOf: Map<string, string | null>,
): boolean {
  let cur = candidateParentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === id) return true;
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = parentOf.get(cur) ?? null;
  }
  return false;
}
