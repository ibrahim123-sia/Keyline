import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { contacts, leadEvents, leads, listingRequests, valuationRequests } from "@/db/schema/crm";
import { locations, propertyTypes } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import {
  agencyInbox,
  agencyWhatsapp,
  leadAdminUrl,
  sendTemplate,
  whatsappNotices,
} from "@/features/leads/process";
import { loadSettings } from "@/features/settings/queries";
import { siteUrl } from "@/features/site/url";
import { defineJob } from "@/jobs/types";
import { format } from "@/lib/i18n";
import { valuation as t } from "@/lib/i18n/dictionaries/valuation";
import { formatMoney } from "@/lib/money";
import { conditionLabel, homeSummary, rangeText, upgradeLabels } from "./format";
import type { OwnerRequestKind } from "./schema";

export const OWNER_REQUEST_NOTIFY_JOB = "owner_request.notify";

/** Loads a valuation or listing request with what its messages need. */
async function loadRequest(db: DbOrTx, kind: OwnerRequestKind, id: string) {
  const table = kind === "valuation" ? valuationRequests : listingRequests;
  const [row] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.agencyId, currentAgencyId())));
  if (!row) return null;
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, row.contactId));
  const [lead] = row.leadId
    ? await db
        .select({ id: leads.id, agentId: leads.agentId })
        .from(leads)
        .where(eq(leads.id, row.leadId))
    : [];
  const [agent] = lead?.agentId
    ? await db
        .select({
          name: agents.name,
          email: agents.email,
          whatsapp: agents.whatsapp,
          isActive: agents.isActive,
        })
        .from(agents)
        .where(eq(agents.id, lead.agentId))
    : [];
  const [location] = row.locationId
    ? await db
        .select({ name: locations.name, slug: locations.slug })
        .from(locations)
        .where(eq(locations.id, row.locationId))
    : [];
  const [type] = row.propertyTypeId
    ? await db
        .select({ name: propertyTypes.name })
        .from(propertyTypes)
        .where(eq(propertyTypes.id, row.propertyTypeId))
    : [];
  const listing = "askingPrice" in row ? row : null;
  return {
    row,
    listing,
    contact: contact ?? null,
    lead: lead ?? null,
    agent: agent ?? null,
    location: location ?? null,
    type: type ?? null,
  };
}

/**
 * Announces a valuation or listing request (13 §3 "Valuation / listing request"): the agent
 * (email + WhatsApp) and the lead inbox, as Settings -> Notifications says, and a
 * confirmation to the owner, with the estimate for a valuation. A retried job never sends an
 * email twice (sendTemplate checks the log).
 */
export async function notifyOwnerRequest(db: DbOrTx, kind: OwnerRequestKind, requestId: string) {
  const loaded = await loadRequest(db, kind, requestId);
  if (!loaded || !loaded.contact) return { skipped: "missing" };
  const { row, listing, contact, lead, agent, location, type } = loaded;
  const [general, market, notifications] = [
    await loadSettings("general", db),
    await loadSettings("market", db),
    await loadSettings("notifications", db),
  ];
  const currency = market.baseCurrency;
  const area = location?.name ?? row.building ?? general.agencyName;
  const home = homeSummary(
    {
      typeName: type?.name ?? null,
      beds: row.beds,
      size: row.size,
      building: row.building,
      areaName: location?.name ?? null,
    },
    market.areaUnit,
  );
  const period = row.purpose === "rent" ? market.rentPeriod : null;
  const hasEstimate = row.aiRangeMin != null && row.aiRangeMax != null;
  const range = hasEstimate ? rangeText(row.aiRangeMin!, row.aiRangeMax!, currency, period) : null;
  const agentActive = agent?.isActive ? agent : null;
  const agentFirst = agentActive ? agentActive.name.split(/\s+/)[0]! : general.agencyName;
  const purpose = t.messages.purposes[row.purpose];
  const areaLink = location
    ? siteUrl(`/${row.purpose === "rent" ? "rent" : "buy"}/${location.slug}`)
    : siteUrl("/");
  const related = {
    type: kind === "valuation" ? "valuation_request" : "listing_request",
    id: row.id,
  };
  const sent: string[] = [];

  // The owner's confirmation (+ estimate).
  if (contact.email) {
    const key = kind === "valuation" ? "valuation.received" : "listing_request.received";
    const estimate =
      kind !== "valuation"
        ? null
        : range
          ? format(t.messages.estimate, {
              range,
              count: row.aiComparableIds.length,
              area,
            })
          : format(t.messages.noEstimate, { area });
    const ids = await sendTemplate(
      db,
      key,
      [contact.email],
      {
        name: contact.name.split(/\s+/)[0] ?? contact.name,
        agency: general.agencyName,
        agent: agentFirst,
        area,
        home,
        estimate,
        purpose,
        url: areaLink,
      },
      areaLink,
      related,
    );
    sent.push(...ids);
    if (ids.length > 0 && lead)
      await db.insert(leadEvents).values({
        leadId: lead.id,
        type: "email_sent",
        meta: { template: key, auto: true, emailId: ids[0] },
        actorType: "system",
        createdAt: new Date(),
      });
  }

  // The team: the agent and the lead inbox (Settings -> Notifications).
  const toggle = kind === "valuation" ? "valuationRequest" : "listingRequest";
  const to: string[] = [];
  if (notifications.admins[toggle].email) to.push(...(await agencyInbox(db)));
  if (notifications.agents[toggle].email && agentActive?.email) to.push(agentActive.email);
  const details = [
    kind === "valuation"
      ? range
        ? format(t.messages.estimateLine, { range, count: row.aiComparableIds.length })
        : t.messages.noEstimateLine
      : null,
    listing?.askingPrice != null
      ? format(t.messages.askingLine, { price: formatMoney(listing.askingPrice, currency) })
      : null,
    listing?.availableFrom
      ? format(t.messages.availableLine, { date: listing.availableFrom })
      : null,
    conditionLabel(row.condition)
      ? format(t.messages.conditionLine, { condition: conditionLabel(row.condition)! })
      : null,
    row.upgrades.length
      ? format(t.messages.upgradesLine, { upgrades: upgradeLabels(row.upgrades).join(", ") })
      : null,
    row.photoIds.length ? format(t.messages.photosLine, { count: row.photoIds.length }) : null,
  ]
    .filter(Boolean)
    .join("\n");
  const url = lead ? leadAdminUrl(lead.id) : siteUrl("/admin/leads");
  const vars = {
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    area,
    home,
    purpose,
    details,
    message: row.notes,
    agent: agent?.name ?? "Not assigned yet",
    url,
  };
  const key = kind === "valuation" ? "valuation.new" : "listing_request.new";
  const numbers: string[] = [];
  if (notifications.admins[toggle].whatsapp) numbers.push(...(await agencyWhatsapp(db)));
  if (notifications.agents[toggle].whatsapp && agentActive?.whatsapp)
    numbers.push(agentActive.whatsapp);
  await whatsappNotices(db, key, numbers, vars, `wa:${related.type}:${row.id}`);
  sent.push(...(await sendTemplate(db, key, to, vars, url, related, contact.email)));
  return { sent: sent.length };
}

export const ownerRequestNotifyJob = defineJob({
  name: OWNER_REQUEST_NOTIFY_JOB,
  payload: z.object({ kind: z.enum(["valuation", "listing"]), requestId: z.uuid() }),
  maxAttempts: 5,
  run: ({ kind, requestId }, { db }) => notifyOwnerRequest(db, kind, requestId),
});
