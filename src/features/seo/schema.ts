import { z } from "zod";
import { optionalHttpUrl } from "@/lib/schemas";

export { httpUrl, optionalHttpUrl } from "@/lib/schemas";

/** SEO block fields (05 "SEO-able tables"); the full panel with AI suggestions lands in Phase 5. */
export const seoInputSchema = z.object({
  seoTitle: z.string().trim().max(120).nullable(),
  seoDescription: z.string().trim().max(320).nullable(),
  canonicalUrl: optionalHttpUrl(),
  noindex: z.boolean(),
  ogImageId: z.uuid().nullable(),
});

export type SeoInput = z.infer<typeof seoInputSchema>;
