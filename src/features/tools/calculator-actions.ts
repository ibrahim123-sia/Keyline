"use server";

import type { z } from "zod";
import { getDb } from "@/db/client";
import { currentVisitorKey } from "@/features/attribution/current";
import { errorsByPath, toActionError, type ActionResult } from "@/lib/actions";
import { hit, rateLimitRules } from "@/lib/rate-limit";
import { currentRequestMeta } from "@/lib/request";
import { verifyTurnstile } from "@/lib/turnstile";
import { handlePreApproval, handleRoiReport } from "./calculator-leads";
import {
  preApprovalSchema,
  roiReportSchema,
  type PreApprovalInput,
  type RoiReportInput,
} from "./calculator-schema";

/** Validation, honeypot, a per-IP rate limit and Turnstile, as on the listing form (06 §10). */
async function guard<S extends z.ZodType>(
  schema: S,
  input: unknown,
  captchaAction: string,
): Promise<
  { ok: true; data: z.output<S>; bot: boolean } | { ok: false; result: ActionResult<never> }
> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors, formErrors } = errorsByPath(parsed.error);
    return {
      ok: false,
      result: {
        ok: false,
        error: formErrors[0] ?? "Please check the highlighted fields.",
        code: "VALIDATION",
        fieldErrors,
      },
    };
  }
  const data = parsed.data as z.output<S> & { website?: string; captchaToken?: string | null };
  if (data.website) return { ok: true, data, bot: true };
  const db = await getDb();
  const meta = await currentRequestMeta();
  const limit = await hit(`form:${meta.ip ?? "unknown"}`, rateLimitRules.form, db);
  if (!limit.allowed)
    return {
      ok: false,
      result: {
        ok: false,
        error: "Too many messages in a short time. Please try again in a minute.",
        code: "RATE_LIMITED",
      },
    };
  if (!(await verifyTurnstile(data.captchaToken ?? null, meta.ip, captchaAction)))
    return {
      ok: false,
      result: {
        ok: false,
        error: "Please complete the check below and send again.",
        code: "CAPTCHA",
      },
    };
  return { ok: true, data, bot: false };
}

/**
 * "Get pre-approved" on the mortgage calculator (11 §1): a `mortgage` lead with the visitor's
 * attribution. Bots that fill the honeypot get the same success answer.
 */
export async function sendPreApproval(
  input: PreApprovalInput,
): Promise<ActionResult<{ who: string }>> {
  try {
    const checked = await guard(preApprovalSchema, input, "mortgage-pre-approval");
    if (!checked.ok) return checked.result;
    if (checked.bot) return { ok: true, data: { who: "" } };
    const { consent: _consent, website: _website, captchaToken: _token, ...data } = checked.data;
    const res = await handlePreApproval(await getDb(), data, await currentVisitorKey());
    return { ok: true, data: { who: res.who } };
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * "Email me this report" on the rental return simulator (11 §2): a `roi` lead, then the PDF
 * report by email (a job). Bots that fill the honeypot get the same success answer.
 */
export async function emailRoiReport(
  input: RoiReportInput,
): Promise<ActionResult<{ email: string }>> {
  try {
    const checked = await guard(roiReportSchema, input, "roi-report");
    if (!checked.ok) return checked.result;
    const { consent: _consent, website: _website, captchaToken: _token, ...data } = checked.data;
    if (checked.bot) return { ok: true, data: { email: data.email } };
    await handleRoiReport(await getDb(), data, await currentVisitorKey());
    return { ok: true, data: { email: data.email } };
  } catch (err) {
    return toActionError(err);
  }
}
