import { z } from "zod";
import type { ContentStatus } from "@/db/schema/content";
import { SLUG_RE } from "@/lib/slug";

/** Shared by the blog and area guides (08 §3-4): slugs, publishing and labels. Client-safe. */

export const slugField = () =>
  z
    .string()
    .trim()
    .regex(SLUG_RE, "Lowercase letters, numbers and hyphens")
    .max(100)
    .or(z.literal(""));

export const publishingSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("schedule"), id: z.uuid(), publishAt: z.iso.datetime() }).strict(),
  z.object({ action: z.literal("unpublish"), id: z.uuid() }).strict(),
]);

export type Publishing = z.infer<typeof publishingSchema>;

export type ContentProblem = { field: string; message: string };

export const contentStatusLabels: Record<ContentStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
};
