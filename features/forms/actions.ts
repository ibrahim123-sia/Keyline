"use server";

import { getDb } from "@/db/client";
import { errorsByPath, toActionError, type ActionResult } from "@/lib/actions";
import { hit, rateLimitRules } from "@/lib/rate-limit";
import { currentRequestMeta } from "@/lib/request";
import { verifyTurnstile } from "@/lib/turnstile";
import { handlePageForm } from "./handle";
import { pageFormSchema, type PageFormInput } from "./schema";

/**
 * Public page forms (06 §10): validated on the server, a honeypot, a per-IP rate limit and
 * Turnstile; then the agency is emailed. Bots that fill the honeypot get the same success
 * answer, so they learn nothing.
 */
export async function sendPageForm(input: PageFormInput): Promise<ActionResult<{ sent: true }>> {
  try {
    const parsed = pageFormSchema.safeParse(input);
    if (!parsed.success) {
      const { fieldErrors, formErrors } = errorsByPath(parsed.error);
      return {
        ok: false,
        error: formErrors[0] ?? "Please check the highlighted fields.",
        code: "VALIDATION",
        fieldErrors,
      };
    }
    const { consent: _consent, website, captchaToken, ...data } = parsed.data;
    if (website) return { ok: true, data: { sent: true } };

    const db = await getDb();
    const meta = await currentRequestMeta();
    const limit = await hit(`form:${meta.ip ?? "unknown"}`, rateLimitRules.form, db);
    if (!limit.allowed)
      return {
        ok: false,
        error: "Too many messages in a short time. Please try again in a minute.",
        code: "RATE_LIMITED",
      };
    if (!(await verifyTurnstile(captchaToken, meta.ip, "page-form")))
      return {
        ok: false,
        error: "Please complete the check below and send again.",
        code: "CAPTCHA",
      };
    await handlePageForm(db, data);
    return { ok: true, data: { sent: true } };
  } catch (err) {
    return toActionError(err);
  }
}
