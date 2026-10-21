import type { InquiryInput } from "./schema";

/**
 * The listing form's checks in the browser, with the server schema's wording (schema.ts),
 * without shipping Zod to every property page (it is a third of the page's JavaScript). The
 * server checks everything again. Client-safe.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkInquiry(v: InquiryInput): Partial<Record<keyof InquiryInput, string>> {
  const errors: Partial<Record<keyof InquiryInput, string>> = {};
  const name = v.name.trim();
  if (name.length < 2) errors.name = "Enter your name";
  else if (name.length > 80) errors.name = "Use at most 80 characters";
  const email = v.email.trim();
  if (email && (!EMAIL.test(email) || email.length > 160))
    errors.email = "Enter a valid email address";
  const phone = v.phone.trim();
  if (phone.length > 30) errors.phone = "That number is too long";
  if ((v.message ?? "").trim().length > 2000) errors.message = "Use at most 2,000 characters";
  if ((v.preferredTime ?? "").trim().length > 120)
    errors.preferredTime = "Use at most 120 characters";
  if (v.consent !== true) errors.consent = "Please agree so we can contact you.";
  if (v.kind === "callback" && !phone) errors.phone ??= "Enter the number to call";
  if (v.kind !== "callback" && !email && !phone && !errors.email)
    errors.email = "Enter an email address or a phone number so we can reply";
  return errors;
}
