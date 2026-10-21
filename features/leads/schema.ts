import { z } from "zod";
import { preferredContacts } from "@/db/schema/crm";

/** Lead page forms (09 §4): checked in the browser and again on the server. Client-safe. */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .default(null);

export const contactInputSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(120),
    email: z.union([z.email("Enter a valid email address").max(160), z.literal("")]).default(""),
    phone: z.string().trim().max(30).default(""),
    whatsapp: z.string().trim().max(30).default(""),
    nationality: optionalText(60),
    preferredContact: z.enum(preferredContacts).nullable().default(null),
    preferredLanguage: optionalText(40),
    marketingConsent: z.boolean().default(false),
  })
  .strict();

const ids = z.array(z.uuid()).max(30).default([]);

export const requirementsInputSchema = z
  .object({
    purpose: z.enum(["sale", "rent"]).nullable().default(null),
    /** Major units of `currency`. */
    budgetMin: z.number().min(0).max(1e13).nullable().default(null),
    budgetMax: z.number().min(0).max(1e13).nullable().default(null),
    currency: z.string().trim().length(3).nullable().default(null),
    locationIds: ids,
    propertyTypeIds: ids,
    bedsMin: z.number().int().min(0).max(20).nullable().default(null),
    timeline: z
      .enum(["now", "1_3_months", "3_6_months", "6_12_months", "later", "browsing"])
      .nullable()
      .default(null),
    finance: z.enum(["cash", "mortgage", "unknown"]).nullable().default(null),
    moveInDate: z.iso.date().nullable().default(null),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict()
  .refine((r) => r.budgetMin === null || r.budgetMax === null || r.budgetMin <= r.budgetMax, {
    path: ["budgetMax"],
    message: "The top of the budget is below the bottom",
  });

export const callOutcomes = ["answered", "no_answer", "voicemail", "wrong_number"] as const;
export type CallOutcome = (typeof callOutcomes)[number];

export const callOutcomeLabels: Record<CallOutcome, string> = {
  answered: "Spoke to them",
  no_answer: "No answer",
  voicemail: "Left a voicemail",
  wrong_number: "Wrong number",
};

export const timelineOptions = [
  { value: "now", label: "Ready now" },
  { value: "1_3_months", label: "Within 3 months" },
  { value: "3_6_months", label: "3 to 6 months" },
  { value: "6_12_months", label: "6 to 12 months" },
  { value: "later", label: "Later than a year" },
  { value: "browsing", label: "Just browsing" },
] as const;

/** How a lead added by the team reached the agency (09 §1 #19), kept as the source detail. */
export const manualLeadKinds = ["walk-in", "phone call", "referral", "other"] as const;

export const manualLeadSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(120),
    email: z.union([z.email("Enter a valid email address").max(160), z.literal("")]).default(""),
    phone: z.string().trim().max(30).default(""),
    type: z.string().trim().max(30).nullable().default(null),
    how: z.enum(manualLeadKinds).default("phone call"),
    propertyId: z.uuid().nullable().default(null),
    agentId: z.uuid().nullable().default(null),
    message: z.string().trim().max(2000).default(""),
  })
  .strict()
  .refine((v) => v.email || v.phone, {
    path: ["email"],
    message: "Enter an email address or a phone number",
  });
