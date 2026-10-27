import "server-only";
import { and, eq } from "drizzle-orm";
import { createElement } from "react";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { messageTemplates } from "@/db/schema/crm";
import { loadEmailBrand } from "@/emails/brand";
import { renderEmail } from "@/emails/render";
import { TemplateEmail } from "@/emails/template-email";
import {
  fillTemplate,
  templateDefaults,
  type TemplateChannel,
  type TemplateKey,
  type TemplateVars,
} from "./defaults";

export type ResolvedTemplate = {
  subject: string | null;
  body: string;
  button: string | null;
  /** WhatsApp: the approved template at Meta, for messages outside the 24-hour window. */
  waTemplateName: string | null;
  waLanguage: string | null;
  isActive: boolean;
};

/** The agency's version of a template, or the built-in wording. Null when the channel has none. */
export async function loadTemplate(
  db: DbOrTx,
  channel: TemplateChannel,
  key: TemplateKey,
): Promise<ResolvedTemplate | null> {
  const [row] = await db
    .select()
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.agencyId, currentAgencyId()),
        eq(messageTemplates.channel, channel),
        eq(messageTemplates.key, key),
      ),
    );
  const builtIn = templateDefaults[key] as {
    email?: { subject: string; body: string; button?: string };
    whatsapp?: { body: string };
  };
  if (row)
    return {
      subject: row.subject,
      body: row.body,
      button: channel === "email" ? (builtIn.email?.button ?? null) : null,
      waTemplateName: row.waTemplateName,
      waLanguage: row.waLanguage,
      isActive: row.isActive,
    };
  const base = { waTemplateName: null, waLanguage: null, isActive: true };
  if (channel === "email")
    return builtIn.email
      ? {
          ...base,
          subject: builtIn.email.subject,
          body: builtIn.email.body,
          button: builtIn.email.button ?? null,
        }
      : null;
  return builtIn.whatsapp
    ? { ...base, subject: null, body: builtIn.whatsapp.body, button: null }
    : null;
}

/** A branded email from a template, or null when the agency turned that template off. */
export async function renderTemplateEmail(
  db: DbOrTx,
  key: TemplateKey,
  vars: TemplateVars,
  link?: string | null,
): Promise<{ subject: string; html: string; text: string } | null> {
  const template = await loadTemplate(db, "email", key);
  if (!template?.isActive) return null;
  const subject = fillTemplate(template.subject ?? "", vars).trim();
  const body = fillTemplate(template.body, vars);
  const brand = await loadEmailBrand(db);
  const { html, text } = await renderEmail(
    createElement(TemplateEmail, {
      brand,
      preview: subject,
      body,
      button: link && template.button ? { label: template.button, href: link } : null,
    }),
  );
  return { subject, html, text };
}
