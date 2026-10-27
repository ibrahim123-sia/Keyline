import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import type { LeadSource } from "@/db/schema/crm";
import { agents } from "@/db/schema/people";
import { properties } from "@/db/schema/properties";
import { captureLead } from "@/features/leads/capture";
import { liveStatuses } from "@/features/properties/status";
import { loadSettings } from "@/features/settings/queries";
import { ActionError } from "@/lib/actions";
import type { InquiryKind } from "./schema";

export type ListingInquiry = {
  propertyId: string;
  kind: InquiryKind;
  name: string;
  email: string;
  phone: string;
  message: string;
  preferredTime: string;
  similar: boolean;
  /** The visitor cookie, for attribution. */
  visitorKey?: string | null;
};

const sources: Record<InquiryKind, LeadSource> = {
  inquiry: "form",
  tour: "tour",
  callback: "callback",
};

/**
 * A visitor's question, tour or callback request from a listing page (06 §5, 09 §1 #1, #6,
 * #7): it becomes a lead (or a new entry on their open lead) with the listing as interest; the
 * agent and the agency inbox are told, and tours and callbacks get a task. Returns who will
 * answer, for the "what happens next" message.
 */
export async function handleListingInquiry(
  db: Db,
  input: ListingInquiry,
): Promise<{ who: string; leadId: string }> {
  const [listing] = await db
    .select({ id: properties.id, reference: properties.reference })
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

  const when = input.preferredTime.trim();
  const task =
    input.kind === "callback"
      ? { title: when ? `Call back (best time: ${when})` : "Call back", dueAt: new Date() }
      : input.kind === "tour"
        ? {
            title: when
              ? `Arrange a tour of ${listing.reference} (asked for ${when})`
              : `Arrange a tour of ${listing.reference}`,
            dueAt: new Date(),
          }
        : null;

  const lead = await captureLead(db, {
    source: sources[input.kind],
    sourceDetail: "listing",
    contact: {
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      preferredContact: input.kind === "callback" ? "call" : null,
    },
    propertyId: listing.id,
    message: input.message || null,
    details: {
      ...(when ? { preferredTime: when } : {}),
      ...(input.similar ? { similar: true } : {}),
    },
    visitorKey: input.visitorKey ?? null,
    task,
  });

  const [agent] = lead.agentId
    ? await db
        .select({ name: agents.name, isActive: agents.isActive })
        .from(agents)
        .where(eq(agents.id, lead.agentId))
    : [];
  const who = agent?.isActive ? agent.name : (await loadSettings("general", db)).agencyName;
  return { who, leadId: lead.leadId };
}
