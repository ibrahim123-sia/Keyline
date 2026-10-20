import { z } from "zod";

/**
 * A web address that is safe to put in an href: http(s) only. `z.url()` alone would accept
 * `javascript:` and `data:` URLs, which run script when a visitor clicks them.
 */
export const httpUrl = (message = "Enter a full web address, starting with https://") =>
  z.url({ protocol: /^https?$/, message });

/** Optional link field: a safe URL, or empty. */
export const optionalHttpUrl = () => z.union([httpUrl(), z.literal("")]).nullable();

/** SEO block fields (05 "SEO-able tables"); the full panel with AI suggestions lands in Phase 5. */
export const seoInputSchema = z.object({
  seoTitle: z.string().trim().max(120).nullable(),
  seoDescription: z.string().trim().max(320).nullable(),
  canonicalUrl: optionalHttpUrl(),
  noindex: z.boolean(),
  ogImageId: z.uuid().nullable(),
});

export type SeoInput = z.infer<typeof seoInputSchema>;
