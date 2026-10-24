"use server";

import { getDb } from "@/db/client";
import { currentVisitorKey } from "@/features/attribution/current";
import { errorsByPath, toActionError, type ActionResult } from "@/lib/actions";
import { brochure as t } from "@/lib/i18n/dictionaries/brochure";
import { hit, rateLimitRules } from "@/lib/rate-limit";
import { currentRequestMeta } from "@/lib/request";
import { verifyTurnstile } from "@/lib/turnstile";
import { handleBrochureRequest } from "./request";
import { brochureRequestSchema, type BrochureRequestInput } from "./schema";
import { brochurePath } from "./links";

/**
 * The brochure email gate (11 §4): validated on the server, honeypot, a per-IP rate limit and
 * Turnstile, then a `brochure` lead and the emailed link. Returns the link for an immediate
 * download as well. Bots that fill the honeypot get a harmless answer.
 */
export async function requestBrochure(
  input: BrochureRequestInput,
): Promise<ActionResult<{ email: string; downloadUrl: string }>> {
  try {
    const parsed = brochureRequestSchema.safeParse(input);
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
    if (data.website)
      return {
        ok: true,
        data: { email: data.email, downloadUrl: brochurePath(data.kind, data.id) },
      };

    const db = await getDb();
    const meta = await currentRequestMeta();
    const limit = await hit(`form:${meta.ip ?? "unknown"}`, rateLimitRules.form, db);
    if (!limit.allowed) return { ok: false, error: t.errors.tooMany, code: "RATE_LIMITED" };
    if (!(await verifyTurnstile(data.captchaToken, meta.ip, "brochure")))
      return { ok: false, error: t.errors.captcha, code: "CAPTCHA" };

    const res = await handleBrochureRequest(db, {
      kind: data.kind,
      id: data.id,
      name: data.name,
      email: data.email,
      visitorKey: await currentVisitorKey(),
    });
    return { ok: true, data: { email: data.email, downloadUrl: res.downloadPath } };
  } catch (err) {
    return toActionError(err);
  }
}
