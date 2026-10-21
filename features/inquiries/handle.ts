import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createElement } from "react";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { agents } from "@/db/schema/people";
import { properties } from "@/db/schema/properties";
import { loadEmailBrand } from "@/emails/brand";
import { ListingInquiryEmail } from "@/emails/inquiry-emails";
import { renderEmail } from "@/emails/render";
import { queueEmail } from "@/features/notifications/email";
import { liveStatuses } from "@/features/properties/status";
import { loadSettings } from "@/features/settings/queries";
import { ActionError } from "@/lib/actions";
import { normalizeVisitorPhone, type InquiryKind } from "./schema";

export type ListingInquiry = {
  propertyId: string;
  kind: InquiryKind;
  name: string;
  email: string;
  phone: string;
  message: string;
  preferredTime: string;
  similar: boolean;
};

const subjects: Record<InquiryKind, string> = {
  inquiry: "New question",
  tour: "Tour request",
  callback: "Callback request",
};

/**
 * A visitor's question, tour or callback request from a listing page (06 §5, §10): the agent
 * (or the agency's lead inbox) gets an email to reply to. Returns who will answer, for the
 * "what happens next" message. Phase 6 creates the lead from this same call.
 */
export async function handleListingInquiry(
  db: DbOrTx,
  input: ListingInquiry,
): Promise<{ who: string; emailsQueued: number }> {
  const [listing] = await db
    .select({
      id: properties.id,
      reference: properties.reference,
      title: properties.title,
      slug: properties.slug,
      agentId: properties.agentId,
    })
    .from(properties)
    .where(
      and(
        eq(properties.id, input.propertyId),
        eq(properties.agencyId, currentAgencyId()),
        isNull(properties.deletedAt),
        inArray(properties.status, [...liveStatuses]),
      ),
    );
  if (!listing) throw new ActionError("This home is no longer listed.", "NOT_FOUND");

  const market = await loadSettings("market", db);
  const phone = input.phone ? normalizeVisitorPhone(input.phone, market.phoneCountryCode) : null;
  if (input.phone && !phone)
    throw new ActionError("Please check the highlighted fields.", "VALIDATION", {
      phone: ["Enter the number with the country code, for example +44 20 7946 0000"],
    });

  const contact = await loadSettings("contact", db);
  const general = await loadSettings("general", db);
  const [agent] = listing.agentId
    ? await db
        .select({ name: agents.name, email: agents.email, isActive: agents.isActive })
        .from(agents)
        .where(eq(agents.id, listing.agentId))
    : [];
  const recipients =
    agent?.isActive && agent.email
      ? [agent.email]
      : contact.leadNotifyEmails.length
        ? contact.leadNotifyEmails
        : contact.email
          ? [contact.email]
          : [];
  if (recipients.length === 0)
    throw new ActionError(
      "We couldn't send your message right now. Please call or message us instead.",
      "NO_RECIPIENT",
    );

  const brand = await loadEmailBrand(db);
  const { html, text } = await renderEmail(
    createElement(ListingInquiryEmail, {
      brand,
      kind: input.kind,
      reference: listing.reference,
      title: listing.title,
      listingUrl: `${brand.appUrl}/property/${listing.slug}`,
      name: input.name,
      email: input.email || null,
      phone,
      message: input.message,
      preferredTime: input.preferredTime,
      similar: input.similar,
    }),
  );
  for (const to of recipients)
    await queueEmail(
      {
        to,
        subject: `${subjects[input.kind]}: ${listing.reference} from ${input.name}`,
        template: `listing.${input.kind}`,
        html,
        text,
        replyTo: input.email || undefined,
        related: { type: "property", id: listing.id },
      },
      db,
    );
  return {
    who: agent?.isActive ? agent.name : general.agencyName,
    emailsQueued: recipients.length,
  };
}
