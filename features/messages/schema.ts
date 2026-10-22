import { z } from "zod";
import {
  isTemplateKey,
  templateDefaults,
  unknownVariables,
  type TemplateDefault,
  type TemplateKey,
} from "./defaults";

/** The templates editor's input (Settings -> Message templates). Client-safe. */

const keySchema = z
  .string()
  .refine(isTemplateKey, "Unknown template")
  .transform((k) => k as TemplateKey);

const builtIn = (key: string) => (templateDefaults as Record<string, TemplateDefault>)[key];

export const templateSaveSchema = z
  .object({
    key: keySchema,
    channel: z.enum(["email", "whatsapp"]),
    subject: z.string().trim().max(200, "Use at most 200 characters").default(""),
    body: z.string().trim().min(1, "Write the message").max(5000, "Use at most 5,000 characters"),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    const def = builtIn(v.key);
    if (!def?.[v.channel]) {
      ctx.addIssue({
        code: "custom",
        path: ["channel"],
        message: "This message has no such channel",
      });
      return;
    }
    if (v.channel === "email" && !v.subject)
      ctx.addIssue({ code: "custom", path: ["subject"], message: "Write the subject" });
    for (const field of ["subject", "body"] as const) {
      const unknown = unknownVariables(v[field], def.variables);
      if (unknown.length)
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `Unknown ${unknown.map((u) => `{{${u}}}`).join(", ")}. Use: ${def.variables.map((x) => `{{${x}}}`).join(" ")}`,
        });
    }
  });
export type TemplateSaveInput = z.input<typeof templateSaveSchema>;

export const templateKeySchema = z.object({
  key: keySchema,
  channel: z.enum(["email", "whatsapp"]),
});

/** The approved WhatsApp template used outside the 24-hour window (13 §1). */
export const whatsappMappingSchema = z
  .object({
    key: keySchema,
    /** Empty removes the mapping. */
    name: z
      .string()
      .trim()
      .max(100)
      .regex(/^$|^[a-z0-9_]+$/, "Use the template's name at Meta: lower case, digits and _"),
    language: z
      .string()
      .trim()
      .max(10)
      .regex(/^$|^[a-z]{2,3}(_[A-Z]{2})?$/, "Like en or en_US"),
    /** Which variables fill {{1}}, {{2}}, … in the approved template, in order. */
    variables: z.array(z.string()).max(10),
  })
  .superRefine((v, ctx) => {
    const unknown = v.variables.filter((x) => !builtIn(v.key)?.variables.includes(x));
    if (unknown.length)
      ctx.addIssue({
        code: "custom",
        path: ["variables"],
        message: `Not a variable of this message: ${unknown.join(", ")}`,
      });
  });
export type WhatsappMappingInput = z.input<typeof whatsappMappingSchema>;

/** Example values for the editor's preview. */
export const sampleValues: Record<string, string> = {
  name: "Sam",
  agent: "Layla",
  agency: "Haven & Dune",
  reference: "HD-2041",
  url: "https://example.com/property/two-bed-marina",
  phone: "+971 50 123 4567",
  email: "sam@example.com",
  source: "Website form",
  interest: "HD-2041 · Two bed with a marina view",
  details: "Preferred time: Saturday 10am",
  message: "Is it still available?",
  minutes: "12",
  what: "HD-2041 · Two bed with a marina view",
  when: "Saturday 24 October at 10:00",
  agencyTime: "",
  how: "In person",
  notes: "Parking?",
  change: "moved",
  manageUrl: "https://example.com/viewings/…",
  bookUrl: "https://example.com/property/two-bed-marina",
  feedbackUrl: "https://example.com/viewings/…/feedback",
  homes: "3 homes",
  confirmUrl: "https://example.com/newsletter/confirm/…",
  unsubscribeUrl: "https://example.com/newsletter/unsubscribe?…",
};
