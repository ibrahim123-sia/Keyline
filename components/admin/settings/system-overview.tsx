"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { DataTable, UrlFilterSelect, type ColumnDef } from "@/components/admin/data-table";
import { FormSection } from "@/components/admin/page-header";
import { SidePanel } from "@/components/admin/side-panel";
import { Button } from "@/components/ui/button";
import { retryJobRuns } from "@/features/system/actions";
import type { IntegrationState, JobRunRow, JobStatus } from "@/features/system/queries";

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium" });

const statusLabel: Record<JobStatus, string> = {
  queued: "Waiting",
  running: "Running",
  succeeded: "Done",
  failed: "Failed",
  dead: "Gave up",
};

function StatusPill({ status, retrying }: { status: JobStatus; retrying?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap",
        status === "succeeded" && "bg-success-soft text-success",
        (status === "queued" || status === "running") && "bg-surface-muted text-ink",
        (status === "failed" || status === "dead") && "bg-danger/10 text-danger",
      )}
    >
      {retrying && status === "queued" ? "Retrying" : statusLabel[status]}
    </span>
  );
}

function duration(run: JobRunRow): string {
  if (!run.startedAt || !run.finishedAt) return "—";
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const integrationTone: Record<IntegrationState["state"], string> = {
  ok: "bg-success-soft text-success",
  error: "bg-danger/10 text-danger",
  missing: "bg-danger/10 text-danger",
  untested: "bg-accent-soft text-ink",
  off: "bg-surface-muted text-text-muted",
};

/** Admin -> Settings -> System (13 §2, 14 §6): queue health, integrations, AI spend, jobs. */
export function SystemOverview({
  runtime,
  summary,
  integrations,
  ai,
  cron,
  runs,
  total,
  page,
  pageSize,
  sort,
  jobNames,
  readOnly,
}: {
  runtime: { environment: string; storage: string; jobs: string };
  summary: {
    queued: number;
    running: number;
    dead: number;
    failedDay: number;
    succeededDay: number;
    retrying: number;
  };
  integrations: IntegrationState[];
  ai: { spentCents: number; limitCents: number };
  cron: Array<{
    name: string;
    schedule: string;
    lastRunAt: string | null;
    lastStatus: JobStatus | null;
    lastError: string | null;
  }>;
  runs: JobRunRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: { id: string; desc: boolean };
  jobNames: string[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<JobRunRow | null>(null);

  async function retry(ids: string[]) {
    const res = await retryJobRuns({ ids });
    if (!res.ok) return toast.error(res.error);
    toast.success(
      res.data.count
        ? `${res.data.count} job${res.data.count === 1 ? "" : "s"} sent again`
        : "Nothing to retry",
    );
    setOpen(null);
    router.refresh();
  }

  const columns = useMemo<ColumnDef<JobRunRow, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Job",
        meta: { label: "Job" },
        cell: ({ row }) => (
          <span className="font-mono text-[12.5px] text-ink">{row.original.name}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row }) => (
          <StatusPill status={row.original.status} retrying={row.original.lastError !== null} />
        ),
      },
      {
        id: "attempts",
        header: "Tries",
        meta: { label: "Tries", className: "tabular" },
        cell: ({ row }) => `${row.original.attempts} / ${row.original.maxAttempts}`,
      },
      {
        id: "created",
        header: "Started",
        meta: { sortKey: "newest", label: "Started", className: "whitespace-nowrap" },
        cell: ({ row }) => when.format(new Date(row.original.startedAt ?? row.original.createdAt)),
      },
      {
        id: "duration",
        header: "Took",
        meta: { label: "Took", className: "tabular" },
        cell: ({ row }) => duration(row.original),
      },
      {
        id: "error",
        header: "Last error",
        meta: { label: "Last error" },
        cell: ({ row }) =>
          row.original.lastError ? (
            <span className="line-clamp-1 max-w-[22rem] text-danger">{row.original.lastError}</span>
          ) : (
            <span className="text-text-muted">—</span>
          ),
      },
    ],
    [],
  );

  const tiles: Array<[string, number, boolean]> = [
    ["Waiting", summary.queued, false],
    ["Running", summary.running, false],
    ["Retrying", summary.retrying, summary.retrying > 0],
    ["Gave up", summary.dead, summary.dead > 0],
    ["Failed (24 h)", summary.failedDay, summary.failedDay > 0],
    ["Done (24 h)", summary.succeededDay, false],
  ];
  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="flex flex-col gap-6">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
        <div className="flex gap-1.5">
          <dt className="text-text-muted">Environment</dt>
          <dd className="font-semibold text-ink">{runtime.environment}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-text-muted">Files</dt>
          <dd className="font-semibold text-ink">{runtime.storage}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-text-muted">Background jobs</dt>
          <dd className="font-semibold text-ink">{runtime.jobs}</dd>
        </div>
      </dl>

      <section
        aria-label="Job queue"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
      >
        {tiles.map(([label, n, alarm]) => (
          <div
            key={label}
            className={cn(
              "rounded-lg border bg-surface p-3",
              alarm ? "border-danger/40" : "border-border",
            )}
          >
            <p className="text-[12px] text-text-muted">{label}</p>
            <p
              className={cn(
                "text-[22px] font-semibold tabular",
                alarm ? "text-danger" : "text-ink",
              )}
            >
              {n}
            </p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <FormSection
          title="Integrations"
          actions={
            <Link
              href="/admin/settings/integrations"
              className="text-[13px] font-medium text-ink underline underline-offset-2"
            >
              Open settings
            </Link>
          }
        >
          <ul className="flex flex-col gap-2 text-[13px]">
            {integrations.map((i) => (
              <li key={i.name} className="flex items-start justify-between gap-3">
                <span className="font-medium text-ink">{i.name}</span>
                <span className="flex min-w-0 flex-col items-end gap-0.5 text-end">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11.5px] font-semibold",
                      integrationTone[i.state],
                    )}
                  >
                    {i.state === "ok"
                      ? "Working"
                      : i.state === "error"
                        ? "Failing"
                        : i.state === "missing"
                          ? "Key missing"
                          : i.state === "untested"
                            ? "Not tested"
                            : "Off"}
                  </span>
                  {i.state === "error" && (
                    <span className="line-clamp-2 max-w-72 text-[12px] text-danger">
                      {i.detail}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </FormSection>

        <FormSection title="AI spend this month">
          <p className="text-[28px] font-semibold text-ink tabular">{dollars(ai.spentCents)}</p>
          <p className="text-[13px] text-text-muted">
            {ai.limitCents > 0
              ? `Limit ${dollars(ai.limitCents)} (Settings -> AI).`
              : "No monthly limit set."}
          </p>
          {ai.limitCents > 0 && (
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.min(100, (ai.spentCents / ai.limitCents) * 100)}%` }}
              />
            </div>
          )}
        </FormSection>
      </div>

      <FormSection
        title="Scheduled tasks"
        description="Run by the every-minute trigger, in the agency's time zone."
      >
        <ul className="divide-y divide-border text-[13px]">
          {cron.map((t) => (
            <li key={t.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-mono text-[12.5px] text-ink">{t.name}</span>
                <span className="ms-2 text-text-muted">{t.schedule}</span>
              </span>
              <span className="flex items-center gap-2 text-text-muted">
                {t.lastRunAt ? when.format(new Date(t.lastRunAt)) : "Not run yet"}
                {t.lastStatus && <StatusPill status={t.lastStatus} />}
              </span>
              {t.lastError && <span className="w-full text-[12px] text-danger">{t.lastError}</span>}
            </li>
          ))}
        </ul>
      </FormSection>

      <FormSection
        title="Recent jobs"
        description="Each job is tried up to its limit with growing pauses, then it gives up and waits here for a retry."
      >
        <DataTable
          tableId="jobs"
          columns={columns}
          rows={runs}
          total={total}
          page={page}
          pageSize={pageSize}
          sort={sort}
          getRowId={(r) => r.id}
          onRowClick={setOpen}
          searchPlaceholder="Search jobs"
          toolbar={
            <>
              <UrlFilterSelect
                param="status"
                label="Status"
                options={(Object.keys(statusLabel) as JobStatus[]).map((s) => ({
                  value: s,
                  label: statusLabel[s],
                }))}
              />
              <UrlFilterSelect
                param="name"
                label="Job"
                options={jobNames.map((n) => ({ value: n, label: n }))}
              />
            </>
          }
          bulkActions={
            readOnly
              ? undefined
              : (ids, clear) => (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await retry(ids);
                      clear();
                    }}
                  >
                    Retry failed
                  </Button>
                )
          }
          empty="No jobs match."
        />
      </FormSection>

      <SidePanel
        wide
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open?.name ?? "Job"}
      >
        {open && (
          <div className="flex flex-col gap-4 text-[13px]">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-text-muted">Status</dt>
              <dd>
                <StatusPill status={open.status} retrying={open.lastError !== null} />
              </dd>
              <dt className="text-text-muted">Tries</dt>
              <dd>
                {open.attempts} of {open.maxAttempts}
              </dd>
              <dt className="text-text-muted">Queued</dt>
              <dd>{when.format(new Date(open.createdAt))}</dd>
              {open.status === "queued" && (
                <>
                  <dt className="text-text-muted">Next try</dt>
                  <dd>{when.format(new Date(open.runAfter))}</dd>
                </>
              )}
              {open.finishedAt && (
                <>
                  <dt className="text-text-muted">Finished</dt>
                  <dd>
                    {when.format(new Date(open.finishedAt))} ({duration(open)})
                  </dd>
                </>
              )}
            </dl>
            {open.lastError && (
              <div>
                <h3 className="mb-1 font-semibold text-ink">Last error</h3>
                <pre className="rounded-md bg-danger/5 p-3 font-mono text-[12px] break-all whitespace-pre-wrap text-danger">
                  {open.lastError}
                </pre>
              </div>
            )}
            <div>
              <h3 className="mb-1 font-semibold text-ink">Input</h3>
              <pre className="rounded-md bg-surface-soft p-3 font-mono text-[12px] break-all whitespace-pre-wrap">
                {JSON.stringify(open.payload, null, 2)}
              </pre>
            </div>
            {open.result !== null && open.result !== undefined && (
              <div>
                <h3 className="mb-1 font-semibold text-ink">Result</h3>
                <pre className="rounded-md bg-surface-soft p-3 font-mono text-[12px] break-all whitespace-pre-wrap">
                  {JSON.stringify(open.result, null, 2)}
                </pre>
              </div>
            )}
            {!readOnly && (open.status === "failed" || open.status === "dead") && (
              <div>
                <Button onClick={() => void retry([open.id])}>Retry now</Button>
              </div>
            )}
          </div>
        )}
      </SidePanel>
    </div>
  );
}
