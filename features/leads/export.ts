import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { contacts, leads } from "@/db/schema/crm";
import { leadStages } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { currencyFormats } from "@/features/properties/format";
import { loadSettings } from "@/features/settings/queries";
import { toCsv } from "@/lib/csv";
import { leads as t } from "@/lib/i18n/dictionaries/leads";
import { toMajor } from "@/lib/money";

/** CSV of these leads (09 §4 bulk "export"), in the order given. */
export async function exportLeadsCsv(
  db: DbOrTx,
  ids: string[],
): Promise<{ csv: string; count: number }> {
  const header = [
    "Name",
    "Email",
    "Phone",
    "Type",
    "Source",
    "Source detail",
    "First channel",
    "First campaign",
    "Last channel",
    "Last campaign",
    "Stage",
    "Status",
    "Agent",
    "Score",
    "Budget min",
    "Budget max",
    "Currency",
    "Deal value",
    "Created",
    "Last activity",
    "First response (minutes)",
    "Tags",
  ];
  if (ids.length === 0) return { csv: toCsv([header], { bom: true }), count: 0 };
  const market = await loadSettings("market", db);
  const formats = currencyFormats(market);
  const rows = await db
    .select({
      id: leads.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      type: leads.type,
      source: leads.source,
      sourceDetail: leads.sourceDetail,
      firstTouch: leads.firstTouch,
      lastTouch: leads.lastTouch,
      stage: leadStages.name,
      status: leads.status,
      agent: agents.name,
      score: leads.aiScore,
      requirements: leads.requirements,
      dealValue: leads.dealValue,
      dealCurrency: leads.dealCurrency,
      createdAt: leads.createdAt,
      lastActivityAt: leads.lastActivityAt,
      responseSeconds: leads.responseSeconds,
      tags: leads.tags,
    })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .leftJoin(leadStages, eq(leadStages.id, leads.stageId))
    .leftJoin(agents, eq(agents.id, leads.agentId))
    .where(inArray(leads.id, ids))
    .orderBy(asc(leads.createdAt));
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const major = (minor: number | null | undefined, code: string | null | undefined) => {
    if (minor === null || minor === undefined) return null;
    const f = formats[code ?? market.baseCurrency.code] ?? market.baseCurrency;
    return toMajor(minor, f.decimals);
  };
  const body = rows.map((r) => [
    r.name,
    r.email,
    r.phone,
    r.type,
    t.sources[r.source],
    r.sourceDetail,
    r.firstTouch ? t.channels[r.firstTouch.channel] : null,
    r.firstTouch?.utm_campaign ?? null,
    r.lastTouch ? t.channels[r.lastTouch.channel] : null,
    r.lastTouch?.utm_campaign ?? null,
    r.stage,
    r.status,
    r.agent,
    r.score,
    major(r.requirements.budgetMin, r.requirements.currency),
    major(r.requirements.budgetMax, r.requirements.currency),
    r.requirements.currency ?? null,
    major(r.dealValue, r.dealCurrency),
    r.createdAt.toISOString(),
    r.lastActivityAt.toISOString(),
    r.responseSeconds === null ? null : Math.round(r.responseSeconds / 60),
    r.tags.join(", "),
  ]);
  return { csv: toCsv([header, ...body], { bom: true }), count: rows.length };
}
