import { z } from "zod";
import { slugField, type ContentProblem } from "@/features/content/schema";
import { seoInputSchema } from "@/features/seo/schema";
import { postDocSchema, postWordCount } from "@/lib/rich-text-post";

/** Blog ("Insights", 08 §3): what the editor sends and the publish rules. Client-safe. */

export { contentStatusLabels, type ContentProblem } from "@/features/content/schema";

export const postInputSchema = z
  .object({
    title: z.string().trim().min(1, "Give the post a title").max(160),
    excerpt: z.string().trim().max(320).nullable(),
    coverId: z.uuid().nullable(),
    body: postDocSchema.nullable(),
    categoryId: z.uuid().nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(15, "Use at most 15 tags"),
    /** The byline: an agent profile or an admin user; neither = the agency. */
    authorAgentId: z.uuid().nullable(),
    authorUserId: z.uuid().nullable(),
    relatedPropertyIds: z.array(z.uuid()).max(12, "Choose at most 12 related homes"),
    slug: slugField(),
  })
  .extend(seoInputSchema.shape)
  .strict()
  .refine((d) => !(d.authorAgentId && d.authorUserId), {
    message: "Choose one author",
    path: ["authorAgentId"],
  });

export type PostInput = z.infer<typeof postInputSchema>;

export const newPostSchema = z
  .object({ title: z.string().trim().min(1, "Give the post a title").max(160) })
  .strict();

/** What a post needs before it can go on the site (and while it stays there). */
export function postPublishProblems(p: Pick<PostInput, "title" | "body">): ContentProblem[] {
  const problems: ContentProblem[] = [];
  if (!p.title.trim()) problems.push({ field: "title", message: "Give the post a title" });
  if (postWordCount(p.body) === 0) problems.push({ field: "body", message: "Write the post" });
  return problems;
}

export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(60),
    slug: slugField(),
    description: z.string().trim().max(500).nullable(),
  })
  .extend(seoInputSchema.shape)
  .strict();

export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const emptyCategory = (): CategoryInput => ({
  name: "",
  slug: "",
  description: null,
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  noindex: false,
  ogImageId: null,
});

export const tagNameSchema = z.string().trim().min(1, "Enter a name").max(40);
