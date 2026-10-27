import { z } from "zod";
import { optionalHttpUrl, seoInputSchema } from "@/features/seo/schema";
import { SLUG_RE } from "@/lib/slug";

/** Developers (07 §1): name, logo, description, website, year, SEO. */
export const developerInputSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(120),
    slug: z
      .string()
      .trim()
      .regex(SLUG_RE, "Lowercase letters, numbers and hyphens")
      .max(80)
      .or(z.literal("")),
    logoId: z.uuid().nullable(),
    description: z.string().trim().max(5000).nullable(),
    website: optionalHttpUrl(),
    establishedYear: z
      .number()
      .int()
      .min(1800, "Enter a year after 1800")
      .refine((y) => y <= new Date().getFullYear(), "The year cannot be in the future")
      .nullable(),
  })
  .extend(seoInputSchema.shape)
  .strict();

export type DeveloperInput = z.infer<typeof developerInputSchema>;

export const emptyDeveloper = (): DeveloperInput => ({
  name: "",
  slug: "",
  logoId: null,
  description: null,
  website: null,
  establishedYear: null,
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  noindex: false,
  ogImageId: null,
});
