import { z } from "zod";
import { brochureKinds } from "./types";

/** The email gate's form (11 §4, 09 §1 #11). Client-safe. */
export const brochureRequestSchema = z
  .object({
    kind: z.enum(brochureKinds),
    id: z.uuid(),
    name: z.string().trim().min(2, "Enter your name").max(80, "Use at most 80 characters"),
    email: z.email("Enter a valid email address").max(160, "Enter a valid email address"),
    consent: z.literal(true, { error: "Please agree so we can send it." }),
    /** Honeypot: hidden from people, filled in by bots. */
    website: z.string().max(200).default(""),
    captchaToken: z.string().max(4000).nullable().default(null),
  })
  .strict();

export type BrochureRequestInput = z.input<typeof brochureRequestSchema>;

export const brochureParamsSchema = z.object({ kind: z.enum(brochureKinds), id: z.uuid() });
