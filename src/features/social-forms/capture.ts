import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { leadEvents, leads } from "@/db/schema/crm";
import { GRAPH_API_VERSION } from "@/features/integrations/checks";
import { captureLead } from "@/features/leads/capture";
import { loadSettings } from "@/features/settings/queries";
import { getSecret } from "@/features/settings/secrets";
import { toMinor } from "@/lib/money";
import {
  applyFieldMap,
  metaFields,
  parseBudget,
  socialSourceLabel,
  socialTouch,
  type SocialLead,
  type SocialSource,
} from "./parse";

export type MetaLeadDetails = {
  field_data?: unknown;
  campaign_id?: string;
  campaign_name?: string;
  ad_id?: string;
  ad_name?: string;
  adset_name?: string;
  form_id?: string;
  platform?: string;
};

type MetaFetcher = (leadgenId: string) => Promise<MetaLeadDetails | null>;
let metaOverride: MetaFetcher | undefined;

/** Tests replace the Graph API call; `undefined` restores it. */
export function setMetaLeadFetcher(f: MetaFetcher | undefined): void {
  metaOverride = f;
}

/** A Lead Ads lead's answers and campaign from the Graph API, with the page token. */
export async function fetchMetaLead(
  db: DbOrTx,
  leadgenId: string,
): Promise<MetaLeadDetails | null> {
  if (metaOverride) return metaOverride(leadgenId);
  const token = await getSecret("social_meta_page_token", db);
  if (!token) return null;
  const fields =
    "created_time,field_data,ad_id,ad_name,adset_name,campaign_id,campaign_name,form_id,platform";
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(leadgenId)}?fields=${fields}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`Meta answered ${res.status} for lead ${leadgenId}`);
  return (await res.json()) as MetaLeadDetails;
}

export function metaLead(
  leadgenId: string,
  details: MetaLeadDetails,
  fallback: { formId: string | null; adId: string | null },
): SocialLead {
  return {
    externalId: `meta:${leadgenId}`,
    fields: metaFields(details.field_data),
    campaignId: details.campaign_id ?? null,
    campaignName: details.campaign_name ?? null,
    adId: details.ad_id ?? fallback.adId,
    adName: details.ad_name ?? null,
    adsetName: details.adset_name ?? null,
    formId: details.form_id ?? fallback.formId,
    platform: details.platform ?? null,
  };
}

/** Seen before (platforms retry webhooks)? */
async function alreadyCaptured(db: DbOrTx, externalId: string) {
  const [row] = await db
    .select({ id: leadEvents.id })
    .from(leadEvents)
    .innerJoin(leads, eq(leads.id, leadEvents.leadId))
    .where(
      and(
        eq(leads.agencyId, currentAgencyId()),
        sql`${leadEvents.meta}->'details'->>'externalLeadId' = ${externalId}`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * One social lead into the pipeline (source social_form): the agency's field map picks name,
 * email, phone, budget and message; other answers stay on the timeline; campaign and ad ids
 * become the touch. Leads without a way to reach them are skipped.
 */
export async function captureSocialLead(
  db: Db,
  source: SocialSource,
  lead: SocialLead,
  now = new Date(),
) {
  if (await alreadyCaptured(db, lead.externalId)) return { skipped: "duplicate" as const };
  const integrations = await loadSettings("integrations", db);
  const mapped = applyFieldMap(lead.fields, integrations.socialFieldMaps[source]);
  if (!mapped.email && !mapped.phone) return { skipped: "no contact details" as const };
  const market = await loadSettings("market", db);
  const budget = parseBudget(mapped.budget);
  const decimals = market.baseCurrency.decimals;
  const res = await captureLead(db, {
    source: "social_form",
    sourceDetail: lead.isTest ? `${socialSourceLabel(source)} (test)` : socialSourceLabel(source),
    contact: {
      name: mapped.name ?? mapped.email ?? mapped.phone!,
      email: mapped.email,
      phone: mapped.phone,
    },
    message: mapped.message,
    requirements:
      budget.max !== null
        ? {
            budgetMin: budget.min !== null ? toMinor(budget.min, decimals) : null,
            budgetMax: toMinor(budget.max, decimals),
            currency: market.baseCurrency.code,
            budgetFrom: "lead",
          }
        : {},
    details: {
      externalLeadId: lead.externalId,
      ...(lead.formId ? { formId: lead.formId } : {}),
      ...mapped.other,
    },
    touch: socialTouch(source, lead, now),
    lenientPhone: true,
    now,
  });
  return { leadId: res.leadId, isNew: res.isNew };
}
