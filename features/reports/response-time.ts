import "server-only";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { reports as t } from "@/lib/i18n/dictionaries/reports";
import { agency, num, numOrNull, within } from "./context";
import { rate } from "./period";
import type { Kpi, ReportContext, ReportData, ReportTable } from "./types";

/** First-reply buckets in minutes (upper bounds, exclusive); the last is "more than a day". */
export const responseBuckets = [
  { key: "under5", max: 5 },
  { key: "under15", max: 15 },
  { key: "under60", max: 60 },
  { key: "under240", max: 240 },
  { key: "under1440", max: 1440 },
  { key: "over1440", max: null },
] as const;

export type ResponseBucket = (typeof responseBuckets)[number]["key"] | "none";

/** Which bucket a first response time (seconds) falls in; null = not answered. */
export function bucketOf(seconds: number | null): ResponseBucket {
  if (seconds === null) return "none";
  const minutes = seconds / 60;
  for (const b of responseBuckets) if (b.max === null || minutes < b.max) return b.key;
  return "over1440";
}

type Summary = {
  leads: number;
  answered: number;
  avg: number | null;
  median: number | null;
  unanswered: number;
};

function summaryOf(r: Record<string, unknown>): Summary {
  return {
    leads: num(r.leads),
    answered: num(r.answered),
    avg: numOrNull(r.avg) === null ? null : Math.round(num(r.avg)),
    median: numOrNull(r.median) === null ? null : Math.round(num(r.median)),
    unanswered: num(r.unanswered),
  };
}

const summaryColumns = sql`
  count(*)::int as leads,
  count(l.response_seconds)::int as answered,
  avg(l.response_seconds) as avg,
  percentile_cont(0.5) within group (order by l.response_seconds) as median,
  (count(*) filter (where l.first_response_at is null and l.status = 'open'))::int as unanswered`;

export type ResponseTimeData = {
  overall: Summary;
  buckets: Array<{ bucket: ResponseBucket; leads: number }>;
  byAgent: Array<Summary & { agentId: string | null; name: string | null }>;
  byHour: Array<Summary & { hour: number }>;
};

/** Leads created in the period and how fast they got a first real reply (09 §3.8, §7). */
export async function responseTimeData(db: DbOrTx, ctx: ReportContext): Promise<ResponseTimeData> {
  const cohort = sql`l.agency_id = ${agency()} and l.merged_into_id is null
    and ${within(sql`l.created_at`, ctx.period, ctx.timeZone)}`;
  const overall = await db.execute(sql`select ${summaryColumns} from leads l where ${cohort}`);
  const bucketCase = sql.join(
    responseBuckets
      .filter((b) => b.max !== null)
      .map((b) => sql`when l.response_seconds < ${b.max! * 60} then ${b.key}`),
    sql` `,
  );
  const buckets = await db.execute<{ bucket: ResponseBucket; leads: number }>(sql`
    select case when l.response_seconds is null then 'none' ${bucketCase} else 'over1440' end as bucket,
      count(*)::int as leads
    from leads l where ${cohort} group by 1`);
  const byAgent = await db.execute(sql`
    select l.agent_id, a.name, ${summaryColumns}
    from leads l left join agents a on a.id = l.agent_id
    where ${cohort} group by l.agent_id, a.name order by leads desc, a.name nulls last`);
  const byHour = await db.execute(sql`
    select extract(hour from l.created_at at time zone ${ctx.timeZone})::int as hour, ${summaryColumns}
    from leads l where ${cohort} group by 1 order by 1`);

  const counted = new Map(buckets.rows.map((r) => [r.bucket, num(r.leads)]));
  const hours = new Map(byHour.rows.map((r) => [num(r.hour), summaryOf(r)]));
  return {
    overall: summaryOf(overall.rows[0] ?? {}),
    buckets: [...responseBuckets.map((b) => b.key), "none" as const].map((bucket) => ({
      bucket,
      leads: counted.get(bucket) ?? 0,
    })),
    byAgent: byAgent.rows.map((r) => ({
      ...summaryOf(r),
      agentId: (r.agent_id as string | null) ?? null,
      name: (r.name as string | null) ?? null,
    })),
    byHour: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      ...(hours.get(hour) ?? { leads: 0, answered: 0, avg: null, median: null, unanswered: 0 }),
    })),
  };
}

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

export async function responseTimeReport(db: DbOrTx, ctx: ReportContext): Promise<ReportData> {
  const d = await responseTimeData(db, ctx);
  const c = t.response.columns;
  const kpi = (
    key: string,
    label: string,
    format: Kpi["format"],
    value: number | null,
    higherIsBetter: boolean,
  ): Kpi => ({ key, label, format, value, previous: null, change: null, higherIsBetter });
  const distribution: ReportTable = {
    id: "distribution",
    title: t.response.distribution,
    columns: [
      { key: "bucket", label: c.bucket, format: "text" },
      { key: "leads", label: c.leads, format: "int" },
      { key: "share", label: c.share, format: "percent" },
    ],
    rows:
      d.overall.leads === 0
        ? []
        : d.buckets.map((b) => ({
            key: b.bucket,
            cells: {
              bucket: t.response.buckets[b.bucket],
              leads: b.leads,
              share: rate(b.leads, d.overall.leads),
            },
          })),
    empty: t.response.empty,
  };
  const summaryCells = (s: Summary) => ({
    leads: s.leads,
    answered: s.answered,
    avg: s.avg,
    median: s.median,
    unanswered: s.unanswered,
  });
  const summaryCols = [
    { key: "leads", label: c.leads, format: "int" as const },
    { key: "answered", label: c.answered, format: "int" as const },
    { key: "avg", label: c.avg, format: "duration" as const },
    { key: "median", label: c.median, format: "duration" as const },
    { key: "unanswered", label: c.unanswered, format: "int" as const },
  ];
  const byAgent: ReportTable = {
    id: "by-agent",
    title: t.response.byAgent,
    columns: [{ key: "agent", label: c.agent, format: "text" }, ...summaryCols],
    rows: d.byAgent.map((a) => ({
      key: a.agentId ?? "none",
      cells: { agent: a.name ?? t.response.unassigned, ...summaryCells(a) },
      href: `/admin/leads?agent=${a.agentId ?? "none"}&from=${ctx.period.from}&to=${ctx.period.to}`,
    })),
    empty: t.response.empty,
  };
  const byHour: ReportTable = {
    id: "by-hour",
    title: t.response.byHour,
    columns: [{ key: "hour", label: c.hour, format: "text" }, ...summaryCols],
    rows:
      d.overall.leads === 0
        ? []
        : d.byHour.map((h) => ({
            key: String(h.hour),
            cells: { hour: hourLabel(h.hour), ...summaryCells(h) },
          })),
    empty: t.response.empty,
  };
  const k = t.response.kpis;
  return {
    key: "response-time",
    title: t.nav["response-time"],
    period: ctx.period,
    kpis: [
      kpi("avg", k.avg, "duration", d.overall.avg, false),
      kpi("median", k.median, "duration", d.overall.median, false),
      kpi("answered", k.answeredRate, "percent", rate(d.overall.answered, d.overall.leads), true),
      kpi("unanswered", k.unanswered, "int", d.overall.unanswered, false),
    ],
    charts:
      d.overall.leads === 0
        ? []
        : [
            {
              id: "distribution",
              title: t.response.distribution,
              kind: "bar",
              data: d.buckets.map((b) => ({ x: t.response.buckets[b.bucket], leads: b.leads })),
              series: [{ key: "leads", label: c.leads }],
              format: "int",
            },
            {
              id: "by-hour",
              title: t.response.hourChart,
              kind: "bar",
              data: d.byHour.map((h) => ({
                x: hourLabel(h.hour),
                minutes: h.avg === null ? 0 : Math.round(h.avg / 6) / 10,
              })),
              series: [{ key: "minutes", label: c.avg }],
              format: "int",
            },
          ],
    tables: [distribution, byAgent, byHour],
    notes: t.response.notes,
  };
}
