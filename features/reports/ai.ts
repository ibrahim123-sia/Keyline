import "server-only";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { reports as t } from "@/lib/i18n/dictionaries/reports";
import { agency, num, within } from "./context";
import type { DateRange } from "./period";
import type { ReportContext, ReportData } from "./types";

export type AiReportNumbers = {
  /** False until the assistant has replied in any conversation (the report shows an empty state). */
  setUp: boolean;
  conversationsHandled: number;
  handedOver: number;
  viewingsBooked: number;
  /** USD cents; null while AI usage is not recorded (no `ai_usage` table yet). */
  costCents: number | null;
};

/**
 * The AI report's numbers (09 §7 AI), in one function so the AI layer can fill in more:
 * - conversations handled: conversations where the assistant replied in the period;
 * - handed over: of those, the ones a person took over or that wait for a person;
 * - viewings booked by AI: viewings created in the period from the website chat or WhatsApp;
 * - AI cost: not recorded yet. When `ai_usage` (05 §14) exists, sum its `cost_estimate` for
 *   the period here.
 */
export async function aiReportNumbers(
  db: DbOrTx,
  range: DateRange,
  timeZone: string,
): Promise<AiReportNumbers> {
  const any = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from (
      select 1 from messages m where m.agency_id = ${agency()} and m.sender = 'ai' limit 1
    ) x`);
  if (num(any.rows[0]?.n) === 0)
    return {
      setUp: false,
      conversationsHandled: 0,
      handedOver: 0,
      viewingsBooked: 0,
      costCents: null,
    };
  const res = await db.execute<{ handled: number; handed: number; viewings: number }>(sql`
    with handled as (
      select distinct c.id, c.status
      from messages m join conversations c on c.id = m.conversation_id
      where m.agency_id = ${agency()} and m.sender = 'ai'
        and ${within(sql`m.created_at`, range, timeZone)}
    )
    select
      (select count(*) from handled)::int as handled,
      (select count(*) from handled h where h.status in ('needs_human', 'human')
        or exists (select 1 from messages a where a.conversation_id = h.id
          and a.sender = 'admin'))::int as handed,
      (select count(*) from viewings v where v.agency_id = ${agency()}
        and v.source in ('chat', 'whatsapp')
        and ${within(sql`v.created_at`, range, timeZone)})::int as viewings`);
  const r = res.rows[0]!;
  return {
    setUp: true,
    conversationsHandled: num(r.handled),
    handedOver: num(r.handed),
    viewingsBooked: num(r.viewings),
    costCents: null,
  };
}

export async function aiReport(db: DbOrTx, ctx: ReportContext): Promise<ReportData> {
  const n = await aiReportNumbers(db, ctx.period, ctx.timeZone);
  const base: ReportData = {
    key: "ai",
    title: t.nav.ai,
    period: ctx.period,
    kpis: [],
    charts: [],
    tables: [],
    notes: t.ai.notes,
  };
  if (!n.setUp)
    return { ...base, emptyState: { title: t.ai.notSetUp, description: t.ai.notSetUpBody } };
  const k = t.ai.kpis;
  const kpi = (key: string, label: string, value: number, higherIsBetter = true) => ({
    key,
    label,
    format: "int" as const,
    value,
    previous: null,
    change: null,
    higherIsBetter,
  });
  return {
    ...base,
    kpis: [
      kpi("handled", k.handled, n.conversationsHandled),
      kpi("handedOver", k.handedOver, n.handedOver, false),
      kpi("viewings", k.viewings, n.viewingsBooked),
    ],
    tables: [
      {
        id: "ai",
        title: t.ai.table,
        columns: [
          { key: "metric", label: t.ai.columns.metric, format: "text" },
          { key: "value", label: t.ai.columns.value, format: "int" },
        ],
        rows: [
          { key: "handled", cells: { metric: k.handled, value: n.conversationsHandled } },
          { key: "handedOver", cells: { metric: k.handedOver, value: n.handedOver } },
          { key: "viewings", cells: { metric: k.viewings, value: n.viewingsBooked } },
          {
            key: "cost",
            cells: {
              metric: k.cost,
              value:
                n.costCents === null
                  ? t.ai.costNotRecorded
                  : `USD ${(n.costCents / 100).toFixed(2)}`,
            },
          },
        ],
        empty: "",
      },
    ],
  };
}
