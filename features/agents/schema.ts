import { z } from "zod";
import type { WeekdayKey, WorkingHours } from "@/db/schema/people";
import { seoInputSchema } from "@/features/seo/schema";
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

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

const dayRanges = z
  .array(z.tuple([hhmm, hhmm]))
  .max(4, "Up to four time ranges a day")
  .superRefine((ranges, ctx) => {
    ranges.forEach(([from, to], i) => {
      if (from >= to)
        ctx.addIssue({ code: "custom", message: "The end must be after the start", path: [i] });
    });
    const sorted = [...ranges].sort((a, b) => a[0].localeCompare(b[0]));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]![0] < sorted[i - 1]![1]) {
        ctx.addIssue({ code: "custom", message: "These times overlap" });
        break;
      }
    }
  });

/** Every weekday; an empty list is a day off. */
export const workingHoursSchema = z.object({
  mon: dayRanges,
  tue: dayRanges,
  wed: dayRanges,
  thu: dayRanges,
  fri: dayRanges,
  sat: dayRanges,
  sun: dayRanges,
}) satisfies z.ZodType<Required<WorkingHours>>;

/**
 * Phone numbers in international format, so tel: and WhatsApp links work from any country.
 * Spaces, dashes, dots and brackets are accepted while typing and removed.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s().-]/g, ""))
  .pipe(
    z
      .string()
      .regex(
        /^\+[1-9]\d{6,14}$/,
        "Use the international format: + and the country code, then the number",
      ),
  );

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
