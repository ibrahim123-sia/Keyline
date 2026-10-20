import { z } from "zod";

export const lngLatSchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

export const poiInputSchema = z
  .object({
    poiTypeId: z.uuid("Choose a type"),
    name: z.string().trim().min(1, "Enter a name").max(150),
    address: z.string().trim().max(300).nullable(),
    point: lngLatSchema,
    googlePlaceId: z.string().trim().max(200).nullable(),
    website: z.union([z.url(), z.literal("")]).nullable(),
    ratingNote: z.string().trim().max(200).nullable(),
    isActive: z.boolean(),
  })
  .strict();

export type PoiInput = z.infer<typeof poiInputSchema>;
