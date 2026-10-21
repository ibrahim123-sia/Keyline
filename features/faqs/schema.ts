import { z } from "zod";
import { faqGroups } from "@/db/schema/content";
import { emptyDoc, richDocSchema, wordCount } from "@/lib/rich-text";

/** FAQs (08 §5): question, rich answer, group, publish and order. Client-safe. */

export type FaqGroup = (typeof faqGroups)[number];

export const faqGroupLabels: Record<FaqGroup, string> = {
  buying: "Buying",
  renting: "Renting",
  off_plan: "Off-plan",
  selling: "Selling",
  general: "General",
};

export const faqInputSchema = z
  .object({
    question: z.string().trim().min(1, "Write the question").max(200),
    answer: richDocSchema.refine((d) => wordCount(d) > 0, "Write the answer"),
    group: z.enum(faqGroups),
    isPublished: z.boolean(),
  })
  .strict();

export type FaqInput = z.infer<typeof faqInputSchema>;

export const emptyFaq = (group: FaqGroup = "general"): FaqInput => ({
  question: "",
  answer: emptyDoc(),
  group,
  isPublished: false,
});
