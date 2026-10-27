import { z } from "zod";

/** The site's booking form (09 §5). Checked on the server; the form shows these messages. */
export const bookingSchema = z
  .object({
    propertyId: z.uuid().nullable().default(null),
    projectId: z.uuid().nullable().default(null),
    type: z.enum(["in_person", "video"]),
    start: z.iso.datetime({ offset: true, error: "Pick a day and time" }),
    name: z.string().trim().min(2, "Enter your name").max(80, "Use at most 80 characters"),
    email: z.union([
      z.email("Enter a valid email address").max(160, "Enter a valid email address"),
      z.literal(""),
    ]),
    phone: z.string().trim().max(30, "That number is too long"),
    notes: z.string().trim().max(1000, "Use at most 1,000 characters").default(""),
    /** The visitor's IANA time zone, from the browser. */
    timeZone: z.string().max(64).nullable().default(null),
    consent: z.literal(true, { error: "Please agree so we can contact you." }),
    website: z.string().max(200).default(""),
    captchaToken: z.string().max(4000).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (!v.propertyId && !v.projectId)
      ctx.addIssue({ code: "custom", path: ["start"], message: "Choose a home to visit" });
    if (!v.phone)
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Enter a number we can reach you on",
      });
  });

export type BookingInput = z.input<typeof bookingSchema>;

export const rescheduleSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
  start: z.iso.datetime({ offset: true, error: "Pick a day and time" }),
});

export const feedbackSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
  rating: z.number().int().min(1, "Choose a rating").max(5),
  text: z.string().trim().max(2000, "Use at most 2,000 characters").default(""),
});
