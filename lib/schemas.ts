import { z } from "zod";

/**
 * Small validators shared by many forms.
 */

/**
 * A web address that is safe to put in an href: http(s) only. `z.url()` alone would accept
 * `javascript:` and `data:` URLs, which run script when a visitor clicks them.
 */
export const httpUrl = (message = "Enter a full web address, starting with https://") =>
  z.url({ protocol: /^https?$/, message });

/** Optional link field: a safe URL, or empty. */
export const optionalHttpUrl = () => z.union([httpUrl(), z.literal("")]).nullable();

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
});

/** A map point (WGS 84). */
export const lngLatSchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});
