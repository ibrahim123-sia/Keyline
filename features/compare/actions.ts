"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { renderTemplateEmail } from "@/features/messages/render";
import { queueEmail } from "@/features/notifications/email";
import { loadSettings } from "@/features/settings/queries";
import { siteUrl } from "@/features/site/url";
import { errorsByPath, toActionError, type ActionResult } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth/guards";
import { format } from "@/lib/i18n";
import { compare as t } from "@/lib/i18n/dictionaries/compare";
import { newId } from "@/lib/ids";
import { hit, rateLimitRules } from "@/lib/rate-limit";
import { currentRequestMeta } from "@/lib/request";
import { verifyTurnstile } from "@/lib/turnstile";
import { comparePath, parseCompareIds } from "./best";
import { compareItems } from "./load";

const sendSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(4),
    /** Guests type it; a signed-in customer's own address is used instead. */
    email: z.union([z.email(t.email.invalid).max(160, t.email.invalid), z.literal("")]).default(""),
    website: z.string().max(200).default(""),
    captchaToken: z.string().max(4000).nullable().default(null),
  })
  .strict();

export type SendComparisonInput = z.input<typeof sendSchema>;

/**
 * "Send to my email" (11 §3): the share link by email (template `compare.sent`). A customer
 * gets it at their account address; a guest types one (rate limit, honeypot and Turnstile).
 */
export async function sendComparison(
  input: SendComparisonInput,
): Promise<ActionResult<{ email: string }>> {
  try {
    const parsed = sendSchema.safeParse(input);
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
    const user = await getCurrentUser();
    const email = (user?.role === "customer" ? user.email : data.email).trim().toLowerCase();
    if (!email)
      return {
        ok: false,
        error: t.email.invalid,
        code: "VALIDATION",
        fieldErrors: { email: [t.email.invalid] },
      };
    if (data.website) return { ok: true, data: { email } };

    const db = await getDb();
    const meta = await currentRequestMeta();
    if (!(await hit(`form:${meta.ip ?? "unknown"}`, rateLimitRules.form, db)).allowed)
      return { ok: false, error: t.email.tooMany, code: "RATE_LIMITED" };
    if (!user && !(await verifyTurnstile(data.captchaToken, meta.ip, "compare-email")))
      return { ok: false, error: t.email.captcha, code: "CAPTCHA" };

    const items = await compareItems(parseCompareIds(data.ids.join(",")));
    if (items.length === 0) return { ok: false, error: t.email.nothing, code: "NOT_FOUND" };
    const url = siteUrl(comparePath(items.map((i) => i.id)));
    const general = await loadSettings("general", db);
    const mail = await renderTemplateEmail(
      db,
      "compare.sent",
      {
        name: user?.name?.split(/\s+/)[0] || t.email.hello,
        homes:
          items.length === 1
            ? t.email.homesOne
            : format(t.email.homesMany, { count: items.length }),
        list: items.map((i) => (i.subtitle ? `${i.subtitle} · ${i.title}` : i.title)).join("\n"),
        agency: general.agencyName,
        url,
      },
      url,
    );
    if (mail)
      await queueEmail(
        {
          to: email,
          subject: mail.subject,
          template: "compare.sent",
          html: mail.html,
          text: mail.text,
          related: { type: "compare", id: newId() },
        },
        db,
      );
    return { ok: true, data: { email } };
  } catch (err) {
    return toActionError(err);
  }
}
