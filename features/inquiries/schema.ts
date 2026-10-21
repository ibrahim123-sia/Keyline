import { z } from "zod";

/** Forms on the property page (06 §5): ask a question, book a tour, request a callback. */
export const inquiryKinds = ["inquiry", "tour", "callback"] as const;
export type InquiryKind = (typeof inquiryKinds)[number];

/**
 * A visitor's phone in international form: "+971 50 123 4567", "00971…" or a local number
 * ("050 123 4567") with the market's country code. Null when it cannot be read.
 */
export function normalizeVisitorPhone(raw: string, countryCode: string | null): string | null {
  let v = raw.trim().replace(/[\s().-]/g, "");
  if (!v) return null;
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  else if (!v.startsWith("+")) {
    if (!countryCode) return null;
    v = `${countryCode}${v.replace(/^0+/, "")}`;
  }
  return /^\+[1-9]\d{6,14}$/.test(v) ? v : null;
}

export const inquirySchema = z
  .object({
    propertyId: z.uuid(),
    kind: z.enum(inquiryKinds),
    name: z.string().trim().min(2, "Enter your name").max(80, "Use at most 80 characters"),
    email: z.union([z.email("Enter a valid email address").max(160), z.literal("")]),
    phone: z.string().trim().max(30, "That number is too long"),
    message: z.string().trim().max(2000, "Use at most 2,000 characters"),
    preferredTime: z.string().trim().max(120).default(""),
    similar: z.boolean().default(false),
    consent: z.literal(true, { error: "Please agree so we can contact you." }),
    /** Honeypot: hidden from people, filled in by bots. */
    website: z.string().max(200).default(""),
    captchaToken: z.string().max(4000).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "callback" && !v.phone)
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter the number to call" });
    if (v.kind !== "callback" && !v.email && !v.phone)
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Enter an email address or a phone number so we can reply",
      });
  });

export type InquiryInput = z.input<typeof inquirySchema>;
