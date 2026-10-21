import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { createElement } from "react";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { pages } from "@/db/schema/cms";
import { loadEmailBrand } from "@/emails/brand";
import { PageFormEmail } from "@/emails/page-form-email";
import { renderEmail } from "@/emails/render";
import { normalizeVisitorPhone } from "@/features/inquiries/schema";
import { queueEmail } from "@/features/notifications/email";
import { loadSettings } from "@/features/settings/queries";
import { ActionError } from "@/lib/actions";
import { pageFormSubjects, type PageForm } from "./schema";

/**
 * A page form submit (06 §10): the agency's lead inbox gets an email to reply to. Phase 6
 * creates the lead (with the visitor's attribution) from this same call.
 */
export async function handlePageForm(
  db: DbOrTx,
  input: Omit<PageForm, "consent" | "website" | "captchaToken">,
): Promise<{ emailsQueued: number }> {
  const market = await loadSettings("market", db);
  const phone = input.phone ? normalizeVisitorPhone(input.phone, market.phoneCountryCode) : null;
  if (input.phone && !phone)
    throw new ActionError("Please check the highlighted fields.", "VALIDATION", {
      phone: ["Enter the number with the country code, for example +44 20 7946 0000"],
    });

  const contact = await loadSettings("contact", db);
  const recipients = contact.leadNotifyEmails.length
    ? contact.leadNotifyEmails
    : contact.email
      ? [contact.email]
      : [];
  if (recipients.length === 0)
    throw new ActionError(
      "We couldn't send your message right now. Please call or message us instead.",
      "NO_RECIPIENT",
    );

  const [page] = input.pageId
    ? await db
        .select({ title: pages.title, slug: pages.slug, isHome: pages.isHome })
        .from(pages)
        .where(
          and(
            eq(pages.id, input.pageId),
            eq(pages.agencyId, currentAgencyId()),
            isNull(pages.deletedAt),
          ),
        )
    : [];
  const brand = await loadEmailBrand(db);
  const details: Array<[string, string]> = [
    ["Preferred time", input.preferredTime],
    ["For", input.purpose === "rent" ? "Rent" : input.purpose === "sale" ? "Sale" : ""],
    ["Where", input.area],
    ["Type", input.propertyType],
    ["Bedrooms", input.beds],
    ["Expected price", input.expectedPrice],
  ];
  const { html, text } = await renderEmail(
    createElement(PageFormEmail, {
      brand,
      formType: input.formType,
      name: input.name,
      email: input.email || null,
      phone,
      message: input.message,
      details: details.filter(([, value]) => value !== ""),
      pageTitle: page?.title ?? null,
      pageUrl: page ? `${brand.appUrl}${page.isHome ? "/" : `/${page.slug}`}` : null,
    }),
  );
  const who = input.name || input.email || phone || "a visitor";
  for (const to of recipients)
    await queueEmail(
      {
        to,
        subject: `${pageFormSubjects[input.formType]} from ${who}`,
        template: `page-form.${input.formType}`,
        html,
        text,
        replyTo: input.email || undefined,
        related: input.pageId ? { type: "page", id: input.pageId } : undefined,
      },
      db,
    );
  return { emailsQueued: recipients.length };
}
