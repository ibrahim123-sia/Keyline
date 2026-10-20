import { z } from "zod";
import { optionalHttpUrl } from "@/features/seo/schema";
import { lngLatSchema } from "@/lib/schemas";

export { lngLatSchema };

export const poiInputSchema = z
  .object({
    poiTypeId: z.uuid("Choose a type"),
    name: z.string().trim().min(1, "Enter a name").max(150),
    address: z.string().trim().max(300).nullable(),
    point: lngLatSchema,
    googlePlaceId: z.string().trim().max(200).nullable(),
    website: optionalHttpUrl(),
    ratingNote: z.string().trim().max(200).nullable(),
    isActive: z.boolean(),
  })
  .strict();

export type PoiInput = z.infer<typeof poiInputSchema>;
