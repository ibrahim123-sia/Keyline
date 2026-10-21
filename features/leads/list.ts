import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { contacts, leads, type Requirements, type Touch } from "@/db/schema/crm";
import { leadStages, locations } from "@/db/schema/master-data";
import { agents } from "@/db/schema/people";
import { currencyFormats } from "@/features/properties/format";
import { loadSettings } from "@/features/settings/queries";
import type { SettingsOf } from "@/features/settings/schema";
import { compactAmount } from "@/lib/currency-display";
import { localDateString } from "@/lib/local-date";
import type { CurrencyFormat } from "@/lib/money";
import type { TableParams } from "@/lib/table-params";
import { leadFiltersFrom, type LeadFilters, type LeadSort } from "./filters";

type Market = SettingsOf<"market">;

export type LeadRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: string;
  source: (typeof leads.$inferSelect)["source"];
  sourceDetail: string | null;
  channel: Touch["channel"] | null;
  campaign: string | null;
  interest: string;
  score: number | null;
  scoreReason: string | null;
  stageId: string | null;
  stageName: string | null;
  stageColor: string | null;
  status: "open" | "won" | "lost";
  agentId: string | null;
  agentName: string | null;
  lastActivityAt: string;
  nextTaskAt: string | null;
  createdAt: string;
  responseSeconds: number | null;
  /** Open, never answered and past the response limit: shown red. */
  overdue: boolean;
  /** Open and never answered (waiting since createdAt). */
  waiting: boolean;
  tags: string[];
};

/** A lead's budget bound in minor units of the base currency (budgets keep their currency). */
function budgetInBase(market: Market, key: "budgetMin" | "budgetMax"): SQL {
  const base = market.baseCurrency;
  const value = sql`(${leads.requirements}->>${key})::numeric`;
  const cases = market.visitorCurrencies
    .filter((c) => c.code !== base.code)
    .map(
      (c) =>
        sql`when ${c.code} then round(${value} / ${10 ** c.decimals} / ${c.rate} * ${10 ** base.decimals})`,
    );
  return cases.length
    ? sql`(case ${leads.requirements}->>'currency' ${sql.join(cases, sql` `)} else ${value} end)`
    : value;
}

/** Monday (or the agency's first day) to the next one, as agency-local dates. */
function thisWeek(now: Date, timeZone: string, firstDay: number): { start: string; end: string } {
  const today = localDateString(now, timeZone);
  const d = new Date(`${today}T00:00:00Z`);
  const back = (d.getUTCDay() - firstDay + 7) % 7;
  const start = new Date(d.getTime() - back * 86_400_000);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export async function leadConditions(
  f: LeadFilters,
  db: DbOrTx,
  now: Date = new Date(),
): Promise<SQL[]> {
  const agency = currentAgencyId();
  const [market, general] = [await loadSettings("market", db), await loadSettings("general", db)];
  const tz = general.timeZone;
  const where: SQL[] = [eq(leads.agencyId, agency), isNull(leads.mergedIntoId)];
  if (f.q) {
    const digits = f.q.replace(/\D/g, "");
    const parts: SQL[] = [
      sql`lintel_normalize(${contacts.name}) like '%' || lintel_normalize(${f.q}) || '%'`,
      sql`${contacts.email} like ${`%${f.q.toLowerCase()}%`}`,
    ];
    if (digits.length >= 4) parts.push(sql`${contacts.phone} like ${`%${digits}%`}`);
    where.push(sql`(${sql.join(parts, sql` or `)})`);
  }
  if (f.stage.length) where.push(inArray(leads.stageId, f.stage));
  if (f.source.length) where.push(inArray(leads.source, f.source));
  if (f.channel.length)
    where.push(
      sql`(${leads.firstTouch}->>'channel' in ${f.channel} or ${leads.lastTouch}->>'channel' in ${f.channel})`,
    );
  if (f.campaign)
    where.push(
      sql`(${leads.firstTouch}->>'utm_campaign' = ${f.campaign} or ${leads.lastTouch}->>'utm_campaign' = ${f.campaign})`,
    );
  if (f.type.length) where.push(inArray(leads.type, f.type));
  if (f.agent === "none") where.push(isNull(leads.agentId));
  else if (f.agent) where.push(eq(leads.agentId, f.agent));
  if (f.scoreMin !== null) where.push(gte(leads.aiScore, f.scoreMin));
  if (f.scoreMax !== null) where.push(lte(leads.aiScore, f.scoreMax));
  if (f.from) where.push(sql`(${leads.createdAt} at time zone ${tz})::date >= ${f.from}::date`);
  if (f.to) where.push(sql`(${leads.createdAt} at time zone ${tz})::date <= ${f.to}::date`);
  if (f.unanswered) where.push(sql`${leads.status} = 'open' and ${leads.firstResponseAt} is null`);
  if (f.viewing === "any")
    where.push(
      sql`exists (select 1 from viewings v where v.lead_id = ${leads.id} and v.status <> 'cancelled')`,
    );
  if (f.viewing === "week") {
    const week = thisWeek(now, tz, general.firstDayOfWeek);
    where.push(sql`exists (
      select 1 from viewings v where v.lead_id = ${leads.id}
        and v.status in ('requested', 'confirmed', 'done', 'rescheduled')
        and (v.starts_at at time zone ${tz})::date >= ${week.start}::date
        and (v.starts_at at time zone ${tz})::date < ${week.end}::date)`);
  }
  if (f.budgetMin !== null || f.budgetMax !== null) {
    const scale = 10 ** market.baseCurrency.decimals;
    const lo = budgetInBase(market, "budgetMin");
    const hi = budgetInBase(market, "budgetMax");
    where.push(sql`(${lo} is not null or ${hi} is not null)`);
    if (f.budgetMax !== null)
      where.push(sql`coalesce(${lo}, 0) <= ${Math.round(f.budgetMax * scale)}`);
    if (f.budgetMin !== null)
      where.push(sql`coalesce(${hi}, 1e18) >= ${Math.round(f.budgetMin * scale)}`);
  }
  if (f.area)
    where.push(sql`exists (
      select 1 from jsonb_array_elements_text(coalesce(${leads.requirements}->'locationIds', '[]'::jsonb)) x(id)
      where x.id in (
        with recursive sub as (
          select id from locations where id = ${f.area} and agency_id = ${agency}
          union all
          select l.id from locations l join sub on l.parent_id = sub.id
        ) select id::text from sub))`);
  if (f.status) where.push(eq(leads.status, f.status));
  if (f.tag) where.push(sql`${f.tag} = any(${leads.tags})`);
  return where;
}

const sortColumns: Record<LeadSort, SQL> = {
  created: sql`${leads.createdAt}`,
  activity: sql`${leads.lastActivityAt}`,
  score: sql`${leads.aiScore}`,
  name: sql`lower(${contacts.name})`,
  next_task: sql`${leads.nextTaskAt}`,
};

const purposeLabel = { sale: "Buy", rent: "Rent" } as const;

/** What they are interested in, in a few words: the listing, the project, or their needs. */
export function interestText(
  row: {
    listingRef: string | null;
    listingTitle: string | null;
    projectName: string | null;
    requirements: Requirements;
  },
  formats: Record<string, CurrencyFormat>,
  base: CurrencyFormat,
): string {
  if (row.listingRef) return `${row.listingRef} · ${row.listingTitle ?? ""}`.trim();
  if (row.projectName) return row.projectName;
  const r = row.requirements;
  const parts: string[] = [];
  if (r.purpose) parts.push(purposeLabel[r.purpose]);
  if (r.bedsMin != null) parts.push(r.bedsMin === 0 ? "Studio+" : `${r.bedsMin}+ bed`);
  const currency = formats[r.currency ?? base.code] ?? base;
  const money = (n: number) => `${currency.symbol} ${compactAmount(n, currency.decimals)}`;
  if (r.budgetMin != null && r.budgetMax != null)
    parts.push(`${money(r.budgetMin)}–${compactAmount(r.budgetMax, currency.decimals)}`);
  else if (r.budgetMax != null) parts.push(`up to ${money(r.budgetMax)}`);
  else if (r.budgetMin != null) parts.push(`from ${money(r.budgetMin)}`);
  return parts.length ? parts.join(" · ") : "General enquiry";
}

const rowSelect = {
  id: leads.id,
  name: contacts.name,
  email: contacts.email,
  phone: contacts.phone,
  type: leads.type,
  source: leads.source,
  sourceDetail: leads.sourceDetail,
  firstTouch: leads.firstTouch,
  lastTouch: leads.lastTouch,
  requirements: leads.requirements,
  score: leads.aiScore,
  scoreReason: leads.aiScoreReason,
  stageId: leads.stageId,
  stageName: leadStages.name,
  stageColor: leadStages.color,
  status: leads.status,
  agentId: leads.agentId,
  agentName: agents.name,
  lastActivityAt: leads.lastActivityAt,
  nextTaskAt: leads.nextTaskAt,
  createdAt: leads.createdAt,
  firstResponseAt: leads.firstResponseAt,
  responseSeconds: leads.responseSeconds,
  responseDueAt: leads.responseDueAt,
  tags: leads.tags,
  listingRef: sql<
    string | null
  >`(select reference from properties where id = ${leads.propertyIds}[1])`,
  listingTitle: sql<
    string | null
  >`(select title from properties where id = ${leads.propertyIds}[1])`,
  projectName: sql<string | null>`(select name from projects where id = ${leads.projectIds}[1])`,
};

function fetchRows(db: DbOrTx, where: SQL | undefined, order: SQL[], limit: number, offset = 0) {
  return db
    .select(rowSelect)
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .leftJoin(leadStages, eq(leadStages.id, leads.stageId))
    .leftJoin(agents, eq(agents.id, leads.agentId))
    .where(where)
    .orderBy(...order)
    .limit(limit)
    .offset(offset);
}
type RawRow = Awaited<ReturnType<typeof fetchRows>>[number];

function toRow(r: RawRow, market: Market, now: Date): LeadRow {
  const touch = r.lastTouch ?? r.firstTouch;
  const waiting = r.status === "open" && !r.firstResponseAt;
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    type: r.type,
    source: r.source,
    sourceDetail: r.sourceDetail,
    channel: touch?.channel ?? null,
    campaign: r.lastTouch?.utm_campaign ?? r.firstTouch?.utm_campaign ?? null,
    interest: interestText(r, currencyFormats(market), market.baseCurrency),
    score: r.score,
    scoreReason: r.scoreReason,
    stageId: r.stageId,
    stageName: r.stageName,
    stageColor: r.stageColor,
    status: r.status,
    agentId: r.agentId,
    agentName: r.agentName,
    lastActivityAt: r.lastActivityAt.toISOString(),
    nextTaskAt: r.nextTaskAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    responseSeconds: r.responseSeconds,
    waiting,
    overdue: waiting && Boolean(r.responseDueAt && r.responseDueAt.getTime() <= now.getTime()),
    tags: r.tags,
  };
}

export async function listLeads(
  params: TableParams<LeadSort>,
  db?: DbOrTx,
  now: Date = new Date(),
): Promise<{ rows: LeadRow[]; total: number }> {
  const conn = db ?? (await getDb());
  const filters = leadFiltersFrom(params.get, params.getAll, params.q);
  const where = and(...(await leadConditions(filters, conn, now)));
  const market = await loadSettings("market", conn);
  const column = sortColumns[params.sort.id];
  const order = params.sort.desc ? sql`${column} desc nulls last` : sql`${column} asc nulls last`;
  const raw = await fetchRows(
    conn,
    where,
    [order, desc(leads.createdAt)],
    params.pageSize,
    (params.page - 1) * params.pageSize,
  );
  const [{ n }] = (await conn
    .select({ n: count() })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .where(where)) as [{ n: number }];
  return { rows: raw.map((r) => toRow(r, market, now)), total: n };
}

/** Every lead id the filters match (export), newest first. */
export async function leadIdsFor(params: TableParams<LeadSort>, db: DbOrTx): Promise<string[]> {
  const filters = leadFiltersFrom(params.get, params.getAll, params.q);
  const rows = await db
    .select({ id: leads.id })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .where(and(...(await leadConditions(filters, db))))
    .orderBy(desc(leads.createdAt))
    .limit(5000);
  return rows.map((r) => r.id);
}

/** The board (09 §4 Kanban): matching leads by stage, most recently active first. */
export async function kanbanLeads(
  filters: LeadFilters,
  db?: DbOrTx,
  now: Date = new Date(),
): Promise<LeadRow[]> {
  const conn = db ?? (await getDb());
  const market = await loadSettings("market", conn);
  const raw = await fetchRows(
    conn,
    and(...(await leadConditions(filters, conn, now))),
    [desc(leads.lastActivityAt)],
    400,
  );
  return raw.map((r) => toRow(r, market, now));
}

export type LeadStageOption = {
  id: string;
  name: string;
  color: string;
  kind: "open" | "won" | "lost";
};

/** Stages, agents, areas and settings the list's filters and bulk actions need. */
export async function leadListOptions(db: DbOrTx) {
  const agency = currentAgencyId();
  const stages = await db
    .select({
      id: leadStages.id,
      name: leadStages.name,
      color: leadStages.color,
      kind: leadStages.kind,
    })
    .from(leadStages)
    .where(eq(leadStages.agencyId, agency))
    .orderBy(asc(leadStages.sortOrder), asc(leadStages.name));
  const agentRows = await db
    .select({ id: agents.id, name: agents.name, isActive: agents.isActive })
    .from(agents)
    .where(eq(agents.agencyId, agency))
    .orderBy(asc(agents.sortOrder), asc(agents.name));
  const areas = await db
    .select({ id: locations.id, name: locations.name, level: locations.level })
    .from(locations)
    .where(
      and(eq(locations.agencyId, agency), inArray(locations.level, ["city", "area", "community"])),
    )
    .orderBy(asc(locations.name));
  const leadSettings = await loadSettings("leads", db);
  const market = await loadSettings("market", db);
  return {
    stages: stages as LeadStageOption[],
    agents: agentRows,
    areas: areas.map((a) => ({ id: a.id, name: a.name })),
    leadTypes: leadSettings.leadTypes,
    lostReasons: leadSettings.lostReasons,
    baseCurrency: market.baseCurrency,
  };
}
