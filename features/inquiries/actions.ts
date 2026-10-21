"use server";

import { getDb } from "@/db/client";
import { currentVisitorKey } from "@/features/attribution/current";
import { errorsByPath, toActionError, type ActionResult } from "@/lib/actions";
import { hit, rateLimitRules } from "@/lib/rate-limit";
import { currentRequestMeta } from "@/lib/request";
import { verifyTurnstile } from "@/lib/turnstile";
import { handleListingInquiry } from "./handle";
import { inquirySchema, type InquiryInput } from "./schema";

/**
 * Public listing form (06 §5, §10): validated on the server, honeypot, a per-IP rate limit and
 * Turnstile; then it becomes a lead (09 §3) with the visitor's attribution. Bots that fill the
 * honeypot get the same success answer, so they learn nothing.
 */
export async function sendListingInquiry(
  input: InquiryInput,
): Promise<ActionResult<{ who: string }>> {
  try {
    const parsed = inquirySchema.safeParse(input);
    if (!parsed.success) {
      const { fieldErrors, formErrors } = errorsByPath(parsed.error);
      return {
        ok: false,
        error: formErrors[0] ?? "Please check the highlighted fields.",
        code: "VALIDATION",
        fieldErrors,
      };
    }
    const data = parsed.data;
    if (data.website) return { ok: true, data: { who: "" } };

    const db = await getDb();
    const meta = await currentRequestMeta();
    const limit = await hit(`form:${meta.ip ?? "unknown"}`, rateLimitRules.form, db);
    if (!limit.allowed)
      return {
        ok: false,
        error: "Too many messages in a short time. Please try again in a minute.",
        code: "RATE_LIMITED",
      };
    if (!(await verifyTurnstile(data.captchaToken, meta.ip, "listing-inquiry")))
      return {
        ok: false,
        error: "Please complete the check below and send again.",
        code: "CAPTCHA",
      };

    const res = await handleListingInquiry(db, {
      propertyId: data.propertyId,
      kind: data.kind,
      name: data.name,
      email: data.email,
      phone: data.phone,
      message: data.message,
      preferredTime: data.preferredTime,
      similar: data.similar,
      visitorKey: await currentVisitorKey(),
    });
    return { ok: true, data: { who: res.who } };
  } catch (err) {
    return toActionError(err);
  }
}
