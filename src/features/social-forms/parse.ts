import type { Touch } from "@/db/schema/crm";

/**
 * Social lead forms (09 §1 #18, 13 §1): Meta Lead Ads, TikTok and Google Ads lead forms, read
 * into one shape; then the agency's field map says which answer is which. Pure.
 */
export type SocialSource = "meta" | "tiktok" | "google";
export type FieldMap = {
  name: string;
  email: string;
  phone: string;
  budget: string;
  message: string;
};

export type SocialLead = {
  /** The platform's id for the lead (retries are stored once). */
  externalId: string;
  fields: Record<string, string>;
  campaignId?: string | null;
  campaignName?: string | null;
  adId?: string | null;
  adName?: string | null;
  adsetName?: string | null;
  formId?: string | null;
  platform?: string | null;
  gclid?: string | null;
  isTest?: boolean;
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;

/** Meta `field_data: [{ name, values: [...] }]` (webhook test leads or the Graph API). */
export function metaFields(fieldData: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(fieldData)) return out;
  for (const f of fieldData as Array<{ name?: unknown; values?: unknown }>) {
    const name = str(f?.name);
    const values = Array.isArray(f?.values) ? f.values.map(str).filter(Boolean) : [];
    if (name && values.length) out[name] = values.join(", ");
  }
  return out;
}

/** Meta Lead Ads webhook: the `leadgen` changes (each needs its answers, inline or fetched). */
export function metaLeadgenEvents(payload: unknown): Array<{
  leadgenId: string;
  formId: string | null;
  adId: string | null;
  fieldData: unknown;
}> {
  const entries = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return [];
  const out: Array<{
    leadgenId: string;
    formId: string | null;
    adId: string | null;
    fieldData: unknown;
  }> = [];
  for (const entry of entries as Array<{ changes?: unknown }>) {
    if (!Array.isArray(entry?.changes)) continue;
    for (const change of entry.changes as Array<{
      field?: unknown;
      value?: Record<string, unknown>;
    }>) {
      if (change?.field !== "leadgen" || !change.value) continue;
      const id = str(change.value.leadgen_id);
      if (!id) continue;
      out.push({
        leadgenId: id,
        formId: str(change.value.form_id),
        adId: str(change.value.ad_id),
        fieldData: change.value.field_data,
      });
    }
  }
  return out;
}

/** Google Ads lead form webhook (`user_column_data` with column ids or names). */
export function googleLead(payload: Record<string, unknown>): SocialLead | null {
  const id = str(payload.lead_id);
  if (!id) return null;
  const fields: Record<string, string> = {};
  const columns = Array.isArray(payload.user_column_data) ? payload.user_column_data : [];
  for (const c of columns as Array<Record<string, unknown>>) {
    const value = str(c.string_value);
    const key = str(c.column_id) ?? str(c.column_name);
    if (key && value) fields[key] = value;
  }
  return {
    externalId: `google:${id}`,
    fields,
    campaignId: str(payload.campaign_id),
    adId: str(payload.creative_id),
    adsetName: str(payload.adgroup_id),
    formId: str(payload.form_id),
    gclid: str(payload.gcl_id),
    isTest: payload.is_test === true,
  };
}

/**
 * TikTok lead webhooks: one lead or a list (`leads`), possibly under `data`, with answers as
 * an object or as [{ name | field_name | key, value }].
 */
export function tiktokLeads(payload: Record<string, unknown>): SocialLead[] {
  const root = (
    payload.data && typeof payload.data === "object" ? payload.data : payload
  ) as Record<string, unknown>;
  const list = Array.isArray(root.leads) ? (root.leads as Array<Record<string, unknown>>) : [root];
  const out: SocialLead[] = [];
  for (const l of list) {
    const id = str(l.lead_id) ?? str(l.id);
    if (!id) continue;
    const fields: Record<string, string> = {};
    const raw = l.fields ?? l.answers ?? l.field_data;
    if (Array.isArray(raw))
      for (const f of raw as Array<Record<string, unknown>>) {
        const key = str(f.name) ?? str(f.field_name) ?? str(f.key);
        const value =
          str(f.value) ??
          (Array.isArray(f.values) ? f.values.map(str).filter(Boolean).join(", ") : null);
        if (key && value) fields[key] = value;
      }
    else if (raw && typeof raw === "object")
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const value = str(v);
        if (value) fields[k] = value;
      }
    out.push({
      externalId: `tiktok:${id}`,
      fields,
      campaignId: str(l.campaign_id),
      campaignName: str(l.campaign_name),
      adId: str(l.ad_id),
      adName: str(l.ad_name),
      adsetName: str(l.adgroup_name) ?? str(l.adgroup_id),
      formId: str(l.form_id) ?? str(l.page_id),
    });
  }
  return out;
}

/** "AED 1,500,000", "1.5M", "800k - 1.2m" -> major-unit amounts. */
export function parseBudget(text: string | null | undefined): {
  min: number | null;
  max: number | null;
} {
  if (!text) return { min: null, max: null };
  const amounts = [
    ...text
      .toLowerCase()
      .replace(/,/g, "")
      .matchAll(/(\d+(?:\.\d+)?)\s*(k|m|mn|million|thousand)?/g),
  ]
    .map((m) => {
      const n = Number(m[1]);
      const unit = m[2];
      return unit === "k" || unit === "thousand" ? n * 1_000 : unit ? n * 1_000_000 : n;
    })
    .filter((n) => n > 0);
  if (amounts.length === 0) return { min: null, max: null };
  if (amounts.length === 1) return { min: null, max: amounts[0]! };
  return { min: Math.min(...amounts), max: Math.max(...amounts) };
}

/** The mapped contact details; every other answer is kept for the timeline. */
export function applyFieldMap(fields: Record<string, string>, map: FieldMap) {
  const lower = new Map(Object.entries(fields).map(([k, v]) => [k.toLowerCase(), { key: k, v }]));
  const used = new Set<string>();
  const pick = (names: string) => {
    for (const n of names
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)) {
      const hit = lower.get(n);
      if (hit) {
        used.add(hit.key);
        return { value: hit.v, name: n };
      }
    }
    return null;
  };
  const name = pick(map.name);
  let fullName = name?.value ?? null;
  // A form that asks first and last name separately.
  if (name && /first/.test(name.name)) {
    const last = lower.get(name.name.replace("first", "last"));
    if (last) {
      used.add(last.key);
      fullName = `${name.value} ${last.v}`;
    }
  }
  const email = pick(map.email)?.value ?? null;
  const phone = pick(map.phone)?.value ?? null;
  const budget = pick(map.budget)?.value ?? null;
  const message = pick(map.message)?.value ?? null;
  const other: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields))
    if (!used.has(k) && Object.keys(other).length < 20) other[k] = v.slice(0, 300);
  return { name: fullName, email: email?.toLowerCase() ?? null, phone, budget, message, other };
}

const sourceLabels: Record<SocialSource, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  google: "Google Ads",
};
export const socialSourceLabel = (s: SocialSource) => sourceLabels[s];

/** Campaign and ad ids as the lead's touch (13 §1: saved as attribution). */
export function socialTouch(source: SocialSource, lead: SocialLead, at: Date): Touch {
  const platform = lead.platform?.toLowerCase();
  const utmSource =
    source === "meta"
      ? platform === "ig" || platform === "instagram"
        ? "instagram"
        : "facebook"
      : source === "tiktok"
        ? "tiktok"
        : "google";
  const touch: Touch = {
    utm_source: utmSource,
    utm_medium: source === "google" ? "cpc" : "paid_social",
    landing_path: lead.formId ? `(lead form ${lead.formId})` : "(lead form)",
    channel: source === "google" ? "paid_search" : "paid_social",
    at: at.toISOString(),
  };
  const campaign = lead.campaignName ?? lead.campaignId;
  if (campaign) touch.utm_campaign = campaign;
  const content = lead.adName ?? lead.adId;
  if (content) touch.utm_content = content;
  if (lead.adsetName) touch.utm_term = lead.adsetName;
  if (lead.gclid) touch.gclid = lead.gclid;
  return touch;
}
