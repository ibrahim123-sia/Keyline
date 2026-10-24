import { and, desc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { jobRuns, jobStatuses } from "@/db/schema/system";
import { loadSettings } from "@/features/settings/queries";
import { listSecretStatus, type SecretStatus } from "@/features/settings/secrets";
import type { SecretKey } from "@/features/settings/schema";
import { cronTasks } from "@/jobs/cron";
import { env } from "@/lib/env";
import type { TableParams } from "@/lib/table-params";

export type { JobStatus } from "@/db/schema/system";
type JobStatus = (typeof jobStatuses)[number];

/** Queue health for the System page (13 §2, 14 §6). */
export async function jobSummary(db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await conn
    .select({
      queued: sql<number>`count(*) filter (where ${jobRuns.status} = 'queued')::int`,
      running: sql<number>`count(*) filter (where ${jobRuns.status} = 'running')::int`,
      dead: sql<number>`count(*) filter (where ${jobRuns.status} = 'dead')::int`,
      failedDay: sql<number>`count(*) filter (where ${jobRuns.status} = 'failed' and ${jobRuns.updatedAt} >= ${dayAgo})::int`,
      succeededDay: sql<number>`count(*) filter (where ${jobRuns.status} = 'succeeded' and ${jobRuns.finishedAt} >= ${dayAgo})::int`,
      retrying: sql<number>`count(*) filter (where ${jobRuns.status} = 'queued' and ${jobRuns.lastError} is not null)::int`,
    })
    .from(jobRuns)
    .where(eq(jobRuns.agencyId, currentAgencyId()));
  return row!;
}

export const jobSortable = ["newest"] as const;

export type JobRunRow = {
  id: string;
  name: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  runAfter: string;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  payload: unknown;
  result: unknown;
};

export async function listJobRuns(
  params: TableParams<(typeof jobSortable)[number]>,
  db?: DbOrTx,
): Promise<{ rows: JobRunRow[]; total: number }> {
  const conn = db ?? (await getDb());
  const where: SQL[] = [eq(jobRuns.agencyId, currentAgencyId())];
  const status = params
    .getAll("status")
    .filter((s): s is JobStatus => (jobStatuses as readonly string[]).includes(s));
  if (status.length) where.push(inArray(jobRuns.status, status));
  if (params.q) where.push(ilike(jobRuns.name, `%${params.q.replace(/[\\%_]/g, "\\$&")}%`));
  const name = params.get("name");
  if (name) where.push(eq(jobRuns.name, name));
  if (params.get("problems") === "1") {
    where.push(sql`(${jobRuns.status} in ('failed', 'dead') or ${jobRuns.lastError} is not null)`);
  }
  const [rows, [count]] = await Promise.all([
    conn
      .select()
      .from(jobRuns)
      .where(and(...where))
      .orderBy(params.sort.desc ? jobRuns.createdAt : desc(jobRuns.createdAt), desc(jobRuns.id))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    conn
      .select({ n: sql<number>`count(*)::int` })
      .from(jobRuns)
      .where(and(...where)),
  ]);
  return {
    total: count?.n ?? 0,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      attempts: r.attempts,
      maxAttempts: r.maxAttempts,
      createdAt: r.createdAt.toISOString(),
      runAfter: r.runAfter.toISOString(),
      startedAt: r.startedAt?.toISOString() ?? null,
      finishedAt: r.finishedAt?.toISOString() ?? null,
      lastError: r.lastError,
      payload: r.payload,
      result: r.result,
    })),
  };
}

/** Each scheduled task and its latest logged run (the every-minute runner is not logged). */
export async function cronStatus(db?: DbOrTx) {
  const conn = db ?? (await getDb());
  const tasks = cronTasks.filter((t) => t.name !== "jobs.run-due");
  const names = tasks.map((t) => `cron:${t.name}`);
  const latest = await conn
    .selectDistinctOn([jobRuns.name], {
      name: jobRuns.name,
      status: jobRuns.status,
      finishedAt: jobRuns.finishedAt,
      createdAt: jobRuns.createdAt,
      lastError: jobRuns.lastError,
    })
    .from(jobRuns)
    .where(and(eq(jobRuns.agencyId, currentAgencyId()), inArray(jobRuns.name, names)))
    .orderBy(jobRuns.name, desc(jobRuns.createdAt));
  const byName = new Map(latest.map((r) => [r.name, r]));
  return tasks.map((t) => {
    const last = byName.get(`cron:${t.name}`);
    return {
      name: t.name,
      schedule: t.schedule,
      lastRunAt: last ? (last.finishedAt ?? last.createdAt).toISOString() : null,
      lastStatus: last?.status ?? null,
      lastError: last?.lastError ?? null,
    };
  });
}

export type IntegrationState = {
  name: string;
  state: "off" | "ok" | "error" | "untested" | "missing";
  detail: string;
};

/** One line per integration: off, missing a key, untested, working or failing (14 §6). */
export async function integrationStatus(db?: DbOrTx): Promise<IntegrationState[]> {
  const conn = db ?? (await getDb());
  const [integrations, keys] = await Promise.all([
    loadSettings("integrations", conn),
    listSecretStatus(conn),
  ]);
  const key = (k: SecretKey) => keys.find((s) => s.key === k)!;
  const line = (name: string, enabled: boolean, k: SecretStatus | null): IntegrationState => {
    if (!enabled) return { name, state: "off", detail: "Turned off" };
    if (k && !k.isSet) return { name, state: "missing", detail: "On, but the key is missing" };
    if (k?.lastError) return { name, state: "error", detail: k.lastError };
    if (k && !k.lastTestedAt) return { name, state: "untested", detail: "Not tested yet" };
    return { name, state: "ok", detail: k?.lastTestedAt ? "Last test passed" : "On" };
  };
  return [
    line("Google Maps Platform", integrations.googleMaps.enabled, key("google_maps_server_key")),
    line("WhatsApp Cloud API", integrations.whatsapp.enabled, key("whatsapp_access_token")),
    line("Email (Resend)", integrations.resend.enabled, key("resend_api_key")),
    line("Google Calendar", integrations.googleCalendar.enabled, key("google_oauth_client_secret")),
    line(
      "AI provider",
      integrations.ai.enabled,
      integrations.ai.provider === "mock" ? null : key("ai_api_key"),
    ),
  ];
}

/** Runtime facts for the System page header. */
export function runtimeInfo() {
  const e = env();
  return {
    environment: e.KEYLINE_ENV,
    storage: e.STORAGE_DRIVER === "r2" ? "Cloudflare R2" : "Local disk",
    jobs:
      e.JOBS_DRIVER === "queue"
        ? "Cloudflare Queues"
        : e.JOBS_DRIVER === "inline"
          ? "In-process"
          : "Manual",
  };
}

/**
 * AI spend this month in USD cents. Usage is recorded per call once the AI features exist
 * (10 §5); until then nothing has been spent.
 */
export async function aiSpendThisMonthCents(): Promise<number> {
  return 0;
}
