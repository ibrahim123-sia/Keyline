import "server-only";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { loadSettings } from "@/features/settings/queries";
import { dealValueInBase } from "@/features/utm/report";
import { reports as t } from "@/lib/i18n/dictionaries/reports";
import { agency, num, numOrNull, within } from "./context";
import type { ReportContext, ReportData, ReportRow, ReportTable } from "./types";

export type AgentStat = {
  agentId: string | null;
  name: string | null;
  leads: number;
  viewings: number;
  won: number;
  /** Minor units of the base currency. */
  dealValue: number;
  avgResponseSeconds: number | null;
  unanswered: number;
};

/**
 * Agents (09 §7): per agent profile, new leads assigned in the period, their viewings in the
 * period (not cancelled), deals won in the period with their value, and how fast the agent's
 * new leads got a first reply. Leads without an agent are one "Not assigned" row. Active agents
 * with nothing in the period still show, with zeros.
 */
export async function agentStats(db: DbOrTx, ctx: ReportContext): Promise<AgentStat[]> {
  const market = await loadSettings("market", db);
  const range = ctx.period;
  const tz = ctx.timeZone;
  const res = await db.execute<Record<string, unknown>>(sql`
    with lead_stats as (
      select l.agent_id, count(*) as leads, avg(l.response_seconds) as avg_response,
        count(*) filter (where l.status = 'open' and l.first_response_at is null) as unanswered
      from leads l
      where l.agency_id = ${agency()} and l.merged_into_id is null
        and ${within(sql`l.created_at`, range, tz)}
      group by l.agent_id
    ), viewing_stats as (
      select v.agent_id, count(*) as viewings
      from viewings v
      where v.agency_id = ${agency()} and v.status <> 'cancelled'
        and ${within(sql`v.starts_at`, range, tz)}
      group by v.agent_id
    ), won_stats as (
      select w.agent_id, count(*) as won, sum(${dealValueInBase(market, "w")}) as deal_value
      from leads w
      where w.agency_id = ${agency()} and w.merged_into_id is null and w.status = 'won'
        and w.won_at is not null and ${within(sql`w.won_at`, range, tz)}
      group by w.agent_id
    ), people as (
      select a.id as agent_id from agents a where a.agency_id = ${agency()} and a.is_active
      union select agent_id from lead_stats
      union select agent_id from viewing_stats
      union select agent_id from won_stats
    )
    select p.agent_id, a.name,
      coalesce(ls.leads, 0)::int as leads,
      coalesce(vs.viewings, 0)::int as viewings,
      coalesce(ws.won, 0)::int as won,
      coalesce(ws.deal_value, 0) as deal_value,
      ls.avg_response,
      coalesce(ls.unanswered, 0)::int as unanswered
    from people p
    left join agents a on a.id = p.agent_id
    left join lead_stats ls on ls.agent_id is not distinct from p.agent_id
    left join viewing_stats vs on vs.agent_id is not distinct from p.agent_id
    left join won_stats ws on ws.agent_id is not distinct from p.agent_id
    order by (p.agent_id is null), leads desc, won desc, a.name`);
  return res.rows
    .map((r) => ({
      agentId: (r.agent_id as string | null) ?? null,
      name: (r.name as string | null) ?? null,
      leads: num(r.leads),
      viewings: num(r.viewings),
      won: num(r.won),
      dealValue: Math.round(num(r.deal_value)),
      avgResponseSeconds:
        numOrNull(r.avg_response) === null ? null : Math.round(num(r.avg_response)),
      unanswered: num(r.unanswered),
    }))
    .filter((a) => a.agentId !== null || a.leads + a.viewings + a.won > 0);
}

export async function agentsReport(db: DbOrTx, ctx: ReportContext): Promise<ReportData> {
  const stats = await agentStats(db, ctx);
  const c = t.agents.columns;
  const cells = (a: Omit<AgentStat, "agentId" | "name">, name: string) => ({
    agent: name,
    leads: a.leads,
    viewings: a.viewings,
    won: a.won,
    dealValue: a.dealValue,
    avgResponse: a.avgResponseSeconds,
    unanswered: a.unanswered,
  });
  const rows: ReportRow[] = stats.map((a) => ({
    key: a.agentId ?? "none",
    href: `/admin/leads?agent=${a.agentId ?? "none"}&from=${ctx.period.from}&to=${ctx.period.to}`,
    cells: cells(a, a.name ?? t.agents.unassigned),
  }));
  const sum = (k: "leads" | "viewings" | "won" | "dealValue" | "unanswered") =>
    stats.reduce((s, a) => s + a[k], 0);
  const table: ReportTable = {
    id: "agents",
    title: t.agents.table,
    columns: [
      { key: "agent", label: c.agent, format: "text" },
      { key: "leads", label: c.leads, format: "int" },
      { key: "viewings", label: c.viewings, format: "int" },
      { key: "won", label: c.won, format: "int" },
      { key: "dealValue", label: c.dealValue, format: "money" },
      { key: "avgResponse", label: c.avgResponse, format: "duration" },
      { key: "unanswered", label: c.unanswered, format: "int" },
    ],
    rows,
    total: stats.length
      ? {
          key: "total",
          cells: {
            agent: t.table.total,
            leads: sum("leads"),
            viewings: sum("viewings"),
            won: sum("won"),
            dealValue: sum("dealValue"),
            avgResponse: null,
            unanswered: sum("unanswered"),
          },
        }
      : undefined,
    empty: t.agents.empty,
  };
  return {
    key: "agents",
    title: t.nav.agents,
    period: ctx.period,
    kpis: [],
    charts: stats.some((a) => a.leads > 0)
      ? [
          {
            id: "agents",
            title: t.agents.chart,
            kind: "hbar",
            data: stats.map((a) => ({ x: a.name ?? t.agents.unassigned, leads: a.leads })),
            series: [{ key: "leads", label: c.leads }],
            format: "int",
          },
        ]
      : [],
    tables: [table],
    notes: t.agents.notes,
  };
}
