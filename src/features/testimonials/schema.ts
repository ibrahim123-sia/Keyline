import { z } from "zod";

/** Testimonials (08 §5): name, role, quote, rating, photo, linked home, publish, order. */
export const testimonialInputSchema = z
  .object({
    name: z.string().trim().min(1, "Enter the name").max(80),
    roleText: z.string().trim().max(120).nullable(),
    quote: z.string().trim().min(1, "Enter what they said").max(1000),
    rating: z.number().int().min(1).max(5).nullable(),
    photoId: z.uuid().nullable(),
    propertyId: z.uuid().nullable(),
    isPublished: z.boolean(),
  })
  .strict();

export type TestimonialInput = z.infer<typeof testimonialInputSchema>;

export const emptyTestimonial = (): TestimonialInput => ({
  name: "",
  roleText: null,
  quote: "",
  rating: null,
  photoId: null,
  propertyId: null,
  isPublished: false,
});
