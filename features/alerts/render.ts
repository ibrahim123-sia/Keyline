import "server-only";
import { createElement } from "react";
import type { DbOrTx } from "@/db/client";
import { AlertEmail, type AlertCard } from "@/emails/alert-email";
import { loadEmailBrand } from "@/emails/brand";
import { renderEmail } from "@/emails/render";
import type { ListingCardData } from "@/features/listings/cards";
import { fillTemplate, type TemplateKey, type TemplateVars } from "@/features/messages/defaults";
import { loadTemplate } from "@/features/messages/render";
import { currencyFormats, priceLabel } from "@/features/properties/format";
import { loadSettings } from "@/features/settings/queries";
import { siteUrl } from "@/features/site/url";
import { mediaVariant } from "@/lib/media-src";
import { formatArea } from "@/lib/units";

/** Listing cards for an email: absolute links and photos, prices in the listing's currency. */
export async function alertCards(
  db: DbOrTx,
  listings: ListingCardData[],
  notes: Map<string, string> = new Map(),
): Promise<AlertCard[]> {
  const market = await loadSettings("market", db);
  const formats = currencyFormats(market);
  return listings.map((l) => {
    const facts = [
      l.beds === null ? null : l.beds === 0 ? "Studio" : `${l.beds} bed`,
      l.baths === null ? null : `${l.baths} bath`,
      l.size ? formatArea(l.size, market.areaUnit) : null,
      l.typeName,
    ]
      .filter(Boolean)
      .join(" · ");
    const photo = l.photos[0]?.url;
    return {
      url: siteUrl(`/property/${l.slug}`),
      title: l.title,
      price: priceLabel(l, formats),
      facts,
      place: l.locationName,
      photoUrl: photo ? siteUrl(mediaVariant(photo, 384)) : null,
      note: notes.get(l.id) ?? null,
    };
  });
}

/** An alert email from its editable template, or null when the agency turned it off. */
export async function renderAlertEmail(
  db: DbOrTx,
  key: TemplateKey,
  vars: TemplateVars,
  input: {
    cards: AlertCard[];
    more: number;
    link: string;
    manageUrl: string;
    unsubscribeUrl: string;
    unsubscribeLabel: string;
  },
): Promise<{ subject: string; html: string; text: string } | null> {
  const template = await loadTemplate(db, "email", key);
  if (!template?.isActive) return null;
  const subject = fillTemplate(template.subject ?? "", vars).trim();
  const brand = await loadEmailBrand(db);
  const { html, text } = await renderEmail(
    createElement(AlertEmail, {
      brand,
      preview: subject,
      body: fillTemplate(template.body, vars),
      cards: input.cards,
      more: input.more,
      button: template.button ? { label: template.button, href: input.link } : null,
      manageUrl: input.manageUrl,
      unsubscribeUrl: input.unsubscribeUrl,
      unsubscribeLabel: input.unsubscribeLabel,
    }),
  );
  return { subject, html, text };
}
