"use server";

import { getDb } from "@/db/client";
import { currentVisitorKey } from "@/features/attribution/current";
import { errorsByPath, toActionError, type ActionResult } from "@/lib/actions";
import { hit, rateLimitRules } from "@/lib/rate-limit";
import { currentRequestMeta } from "@/lib/request";
import { verifyTurnstile } from "@/lib/turnstile";
import { bookViewing } from "./book";
import { cancelViewing, rescheduleViewing, saveViewingFeedback } from "./manage";
import { bookingSchema, feedbackSchema, rescheduleSchema, type BookingInput } from "./schema";

function invalid(error: Parameters<typeof errorsByPath>[0]): ActionResult<never> {
  const { fieldErrors, formErrors } = errorsByPath(error);
  return {
    ok: false,
    error: formErrors[0] ?? "Please check the highlighted fields.",
    code: "VALIDATION",
    fieldErrors,
  };
}

async function limited(db: Awaited<ReturnType<typeof getDb>>) {
  const meta = await currentRequestMeta();
  const limit = await hit(`form:${meta.ip ?? "unknown"}`, rateLimitRules.form, db);
  return { meta, allowed: limit.allowed };
}

const tooMany = {
  ok: false as const,
  error: "Too many requests in a short time. Please try again in a minute.",
  code: "RATE_LIMITED",
};

/** "Book a tour" on a listing or project (09 §5). Bots filling the honeypot learn nothing. */
export async function bookViewingAction(
  input: BookingInput,
): Promise<ActionResult<{ manageToken: string }>> {
  try {
    const parsed = bookingSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;
    if (data.website) return { ok: true, data: { manageToken: "" } };
    const db = await getDb();
    const { meta, allowed } = await limited(db);
    if (!allowed) return tooMany;
    if (!(await verifyTurnstile(data.captchaToken, meta.ip, "viewing-booking")))
      return {
        ok: false,
        error: "Please complete the check below and try again.",
        code: "CAPTCHA",
      };
    const res = await bookViewing(db, {
      propertyId: data.propertyId,
      projectId: data.projectId,
      type: data.type,
      start: new Date(data.start),
      name: data.name,
      email: data.email,
      phone: data.phone,
      notes: data.notes,
      timeZone: data.timeZone,
      visitorKey: await currentVisitorKey(),
    });
    return { ok: true, data: { manageToken: res.manageToken } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function rescheduleViewingAction(input: {
  token: string;
  start: string;
}): Promise<ActionResult<{ start: string }>> {
  try {
    const parsed = rescheduleSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const db = await getDb();
    if (!(await limited(db)).allowed) return tooMany;
    await rescheduleViewing(db, parsed.data.token, new Date(parsed.data.start));
    return { ok: true, data: { start: parsed.data.start } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function cancelViewingAction(input: {
  token: string;
}): Promise<ActionResult<{ cancelled: true }>> {
  try {
    const parsed = rescheduleSchema.pick({ token: true }).safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const db = await getDb();
    if (!(await limited(db)).allowed) return tooMany;
    await cancelViewing(db, parsed.data.token);
    return { ok: true, data: { cancelled: true } };
  } catch (err) {
    return toActionError(err);
  }
}

export async function saveViewingFeedbackAction(input: {
  token: string;
  rating: number;
  text: string;
}): Promise<ActionResult<{ saved: true }>> {
  try {
    const parsed = feedbackSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const db = await getDb();
    if (!(await limited(db)).allowed) return tooMany;
    await saveViewingFeedback(db, parsed.data.token, parsed.data.rating, parsed.data.text);
    return { ok: true, data: { saved: true } };
  } catch (err) {
    return toActionError(err);
  }
}
