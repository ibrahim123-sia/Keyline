import "server-only";
import { eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import type { LeadSource } from "@/db/schema/crm";
import { leadStages } from "@/db/schema/master-data";
import { leads as leadWords } from "@/lib/i18n/dictionaries/leads";
import { reports as t } from "@/lib/i18n/dictionaries/reports";
import { agency, num, within } from "./context";
import { STEP, funnelSteps, stageStepRanks, type FunnelStep } from "./funnel-steps";
import { rate } from "./period";
import type { ReportContext, ReportData, ReportRow, ReportTable } from "./types";

export type FunnelBySource = { source: string; counts: Record<FunnelStep, number> };

/**
 * Leads created in the period with the furthest funnel step each one reached (see
 * `funnel-steps.ts` for how the pipeline maps onto the steps), counted by source.
 */
export async function funnelBySource(db: DbOrTx, ctx: ReportContext): Promise<FunnelBySource[]> {
  const stages = await db
    .select({ id: leadStages.id, kind: leadStages.kind, sortOrder: leadStages.sortOrder })
    .from(leadStages)
    .where(eq(leadStages.agencyId, currentAgencyId()));
  const ranks = [...stageStepRanks(stages)];
  const stageRank = ranks.length
    ? sql`(values ${sql.join(
        ranks.map(([id, rank]) => sql`(${id}::text, ${rank}::int)`),
        sql`, `,
      )}) as sr(id, rank)`
    : sql`(select null::text as id, 0 as rank where false) as sr`;
  const res = await db.execute<Record<string, string | number>>(sql`
    with reached as (
      select l.source,
        greatest(
          coalesce((select sr.rank from ${stageRank} where sr.id = l.stage_id::text), 0),
          coalesce((select max(sr.rank) from lead_events e join ${stageRank}
              on sr.id = e.meta->'to'->>'id'
            where e.lead_id = l.id and e.type = 'stage_changed'), 0),
          case when l.first_response_at is not null then ${STEP.contacted} else 0 end,
          case when exists (select 1 from viewings v
            where v.lead_id = l.id and v.status <> 'cancelled') then ${STEP.viewing} else 0 end,
          case when l.status = 'won' then ${STEP.won} else 0 end
        ) as step
      from leads l
      where l.agency_id = ${agency()} and l.merged_into_id is null
        and ${within(sql`l.created_at`, ctx.period, ctx.timeZone)}
    )
    select source,
      ${sql.join(
        funnelSteps.map(
          (s) => sql`(count(*) filter (where step >= ${STEP[s]}))::int as ${sql.identifier(s)}`,
        ),
        sql`, `,
      )}
    from reached group by source order by 2 desc, 1`);
  return res.rows.map((r) => ({
    source: String(r.source),
    counts: Object.fromEntries(funnelSteps.map((s) => [s, num(r[s])])) as Record<
      FunnelStep,
      number
    >,
  }));
}

export async function funnelReport(db: DbOrTx, ctx: ReportContext): Promise<ReportData> {
  const bySource = await funnelBySource(db, ctx);
  const totals = Object.fromEntries(
    funnelSteps.map((s) => [s, bySource.reduce((sum, r) => sum + r.counts[s], 0)]),
  ) as Record<FunnelStep, number>;
  const c = t.funnel.columns;
  const overall: ReportTable = {
    id: "funnel",
    title: t.funnel.overall,
    columns: [
      { key: "step", label: c.step, format: "text" },
      { key: "leads", label: c.leads, format: "int" },
      { key: "ofAll", label: c.ofAll, format: "percent" },
      { key: "ofPrevious", label: c.ofPrevious, format: "percent" },
    ],
    rows:
      totals.lead === 0
        ? []
        : funnelSteps.map((s, i) => ({
            key: s,
            cells: {
              step: t.funnel.steps[s],
              leads: totals[s],
              ofAll: rate(totals[s], totals.lead),
              ofPrevious: i === 0 ? null : rate(totals[s], totals[funnelSteps[i - 1]!]),
            },
          })),
    empty: t.funnel.empty,
  };
  const sourceRow = (key: string, name: string, counts: Record<FunnelStep, number>): ReportRow => ({
    key,
    cells: {
      source: name,
      ...Object.fromEntries(funnelSteps.map((s) => [s, counts[s]])),
      conversion: rate(counts.won, counts.lead),
    },
  });
  const sources: ReportTable = {
    id: "funnel-by-source",
    title: t.funnel.bySource,
    columns: [
      { key: "source", label: c.source, format: "text" },
      ...funnelSteps.map((s) => ({ key: s, label: t.funnel.steps[s], format: "int" as const })),
      { key: "conversion", label: c.conversion, format: "percent" },
    ],
    rows: bySource.map((r) =>
      sourceRow(r.source, leadWords.sources[r.source as LeadSource] ?? r.source, r.counts),
    ),
    total: bySource.length ? sourceRow("total", t.table.total, totals) : undefined,
    empty: t.funnel.empty,
  };
  return {
    key: "funnel",
    title: t.nav.funnel,
    period: ctx.period,
    kpis: [],
    charts:
      totals.lead > 0
        ? [
            {
              id: "funnel",
              title: t.funnel.overall,
              kind: "hbar",
              data: funnelSteps.map((s) => ({ x: t.funnel.steps[s], leads: totals[s] })),
              series: [{ key: "leads", label: c.leads }],
              format: "int",
            },
          ]
        : [],
    tables: [overall, sources],
    notes: t.funnel.notes,
  };
}
