import { z } from "zod";
import type { WeekdayKey } from "@/db/schema/people";
import { seoInputSchema } from "@/features/seo/schema";
import { phoneSchema, workingHoursSchema } from "@/lib/schemas";
import { SLUG_RE } from "@/lib/slug";

export const weekdayKeys = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const satisfies readonly WeekdayKey[];

export const weekdayLabels: Record<WeekdayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** Agent profile (03 "Agent profiles are not users"; 05 `agents`). */
export const agentInputSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(100),
    slug: z
      .string()
      .trim()
      .regex(SLUG_RE, "Lowercase letters, numbers and hyphens")
      .max(80)
      .or(z.literal("")),
    title: z.string().trim().max(80).nullable(),
    photoId: z.uuid().nullable(),
    phone: phoneSchema.nullable(),
    whatsapp: phoneSchema.nullable(),
    email: z.email("Enter a valid email address").max(200).nullable(),
    languages: z
      .array(z.string().trim().min(1).max(40))
      .max(20)
      .transform((list) => [...new Set(list)]),
    areas: z.array(z.uuid()).max(200),
    bio: z.string().trim().max(1500).nullable(),
    replyTimeText: z.string().trim().max(80).nullable(),
    /** null = the agency's viewing hours (Settings -> Viewings). */
    workingHours: workingHoursSchema.nullable(),
    isActive: z.boolean(),
  })
  .extend(seoInputSchema.shape)
  .strict();

export type AgentInput = z.input<typeof agentInputSchema>;

export const emptyAgent = (): AgentInput => ({
  name: "",
  slug: "",
  title: null,
  photoId: null,
  phone: null,
  whatsapp: null,
  email: null,
  languages: [],
  areas: [],
  bio: null,
  replyTimeText: null,
  workingHours: null,
  isActive: true,
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  noindex: false,
  ogImageId: null,
});

/** Suggestions for the languages field (any language can still be typed). */
export const commonLanguages = [
  "English",
  "Arabic",
  "French",
  "German",
  "Spanish",
  "Portuguese",
  "Italian",
  "Dutch",
  "Russian",
  "Ukrainian",
  "Polish",
  "Greek",
  "Turkish",
  "Persian",
  "Hebrew",
  "Hindi",
  "Urdu",
  "Bengali",
  "Punjabi",
  "Tamil",
  "Malayalam",
  "Mandarin",
  "Cantonese",
  "Japanese",
  "Korean",
  "Tagalog",
  "Indonesian",
  "Malay",
  "Thai",
  "Vietnamese",
  "Swahili",
];
