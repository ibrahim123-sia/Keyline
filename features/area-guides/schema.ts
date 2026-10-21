import { z } from "zod";
import { slugField, type ContentProblem } from "@/features/content/schema";
import { seoInputSchema } from "@/features/seo/schema";
import { richDocSchema, wordCount } from "@/lib/rich-text";
import { postDocSchema, postWordCount } from "@/lib/rich-text-post";

/** Area guides (08 §4): what the editor sends and the publish rules. Client-safe. */

const text = (max: number, message?: string) => z.string().trim().min(1, message).max(max);

/** A number an admin enters, always with its source (08 §4 "admin stats with source notes"). */
export const guideStatSchema = z
  .object({
    label: text(60, "Name the number"),
    value: text(40, "Enter the number"),
    source: text(200, "Say where the number comes from"),
  })
  .strict();

/** A question shown on this guide only (faqs.area_guide_id). */
export const guideFaqSchema = z
  .object({
    id: z.uuid(),
    question: text(200, "Write the question"),
    answer: richDocSchema,
    isPublished: z.boolean(),
  })
  .strict();

export const guidePhotoSchema = z
  .object({
    mediaId: z.uuid(),
    caption: z.string().trim().max(200).nullable(),
    alt: z.string().trim().max(300).nullable(),
  })
  .strict();

export const guideInputSchema = z
  .object({
    title: text(160, "Give the guide a title"),
    locationId: z.uuid("Choose the area"),
    intro: z.string().trim().max(600).nullable(),
    body: postDocSchema.nullable(),
    coverId: z.uuid().nullable(),
    gallery: z.array(guidePhotoSchema).max(30, "Use at most 30 photos"),
    highlights: z.array(text(120)).max(12, "Use at most 12 highlights"),
    stats: z.array(guideStatSchema).max(12, "Use at most 12 numbers"),
    faqs: z.array(guideFaqSchema).max(30, "Use at most 30 questions"),
    relatedPostIds: z.array(z.uuid()).max(6, "Choose at most 6 posts"),
    slug: slugField(),
  })
  .extend(seoInputSchema.shape)
  .strict();

export type GuideInput = z.infer<typeof guideInputSchema>;
export type GuideFaqInput = z.infer<typeof guideFaqSchema>;

export const newGuideSchema = z.object({ locationId: z.uuid("Choose the area") }).strict();

/** What a guide needs before it goes on the site (and while it stays there). */
export function guidePublishProblems(
  g: Pick<GuideInput, "title" | "intro" | "body" | "faqs">,
): ContentProblem[] {
  const problems: ContentProblem[] = [];
  if (!g.title.trim()) problems.push({ field: "title", message: "Give the guide a title" });
  if (!g.intro?.trim())
    problems.push({
      field: "intro",
      message: "Write the intro (it also opens the area's search pages)",
    });
  if (postWordCount(g.body) === 0) problems.push({ field: "body", message: "Write the guide" });
  if (g.faqs.some((f) => wordCount(f.answer) === 0))
    problems.push({ field: "faqs", message: "Answer every question" });
  return problems;
}
