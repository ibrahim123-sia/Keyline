"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { cn } from "cn";
import { DataTable, UrlFilterSelect, type ColumnDef } from "@/components/admin/data-table";
import { projectStatuses } from "@/db/schema/projects";
import type { ProjectRow } from "@/features/projects/queries";
import { projectStatusLabels } from "@/features/projects/schema";
import { NewProjectDialog } from "./new-project-dialog";

type Node = { id: string; parentId: string | null; name: string; level: string };

const dateFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const updatedFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" });

/** "Q4 2027", "Mar 2028" or "—". */
export function handoverLabel(p: { handoverDate: string | null; handoverText: string | null }) {
  if (p.handoverText) return p.handoverText;
  if (p.handoverDate) return dateFormat.format(new Date(`${p.handoverDate}T00:00:00Z`));
  return "—";
}

export function PublishedPill({ published }: { published: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap",
        published ? "bg-success-soft text-success" : "bg-surface-muted text-text-muted",
      )}
    >
      {published ? "Published" : "Not published"}
    </span>
  );
}

/** Admin -> Projects (07 §6). */
export function ProjectsManager({
  rows,
  total,
  page,
  pageSize,
  sort,
  developers,
  locations,
  readOnly,
}: {
  rows: ProjectRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: { id: string; desc: boolean };
  developers: Array<{ id: string; name: string }>;
  locations: Node[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const areas = locations.filter((l) => ["city", "area", "community"].includes(l.level));
  const columns = useMemo<ColumnDef<ProjectRow, unknown>[]>(
    () => [
      {
        id: "project",
        header: "Project",
        meta: { sortKey: "name", label: "Project" },
        cell: ({ row: { original: p } }) => (
          <div className="flex min-w-56 items-center gap-3">
            <div className="h-11 w-16 shrink-0 overflow-hidden rounded-md bg-photo-placeholder">
              {p.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- /media resizes on its own
                <img
                  src={`${p.coverUrl}?w=128&q=60`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0">
              <Link
                href={`/admin/projects/${p.id}`}
                onClick={(e) => e.stopPropagation()}
                className="block truncate font-semibold text-ink hover:underline"
              >
                {p.name}
              </Link>
              <p className="truncate text-[12px] text-text-muted">/projects/{p.slug}</p>
            </div>
          </div>
        ),
      },
      {
        id: "developer",
        header: "Developer",
        meta: { label: "Developer" },
        cell: ({ row: { original: p } }) =>
          p.developerName ?? <span className="text-text-muted">—</span>,
      },
      {
        id: "area",
        header: "Area",
        meta: { label: "Area" },
        cell: ({ row: { original: p } }) =>
          p.locationName ?? <span className="text-text-muted">—</span>,
      },
      {
        id: "status",
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row: { original: p } }) => (
          <span className="whitespace-nowrap">{projectStatusLabels[p.status]}</span>
        ),
      },
      {
        id: "handover",
        header: "Handover",
        meta: { sortKey: "handover", label: "Handover" },
        cell: ({ row: { original: p } }) => (
          <span className="whitespace-nowrap">{handoverLabel(p)}</span>
        ),
      },
      {
        id: "progress",
        header: "Progress",
        meta: { sortKey: "progress", label: "Progress" },
        cell: ({ row: { original: p } }) =>
          p.constructionProgress == null ? (
            <span className="text-text-muted">—</span>
          ) : (
            <div className="flex min-w-24 items-center gap-2">
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted"
                aria-hidden
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${p.constructionProgress}%` }}
                />
              </div>
              <span className="tabular">{p.constructionProgress}%</span>
            </div>
          ),
      },
      {
        id: "units",
        header: "Units available",
        meta: { label: "Units available", className: "text-end" },
        cell: ({ row: { original: p } }) => (
          <span className="tabular">{p.unitsAvailable ?? "—"}</span>
        ),
      },
      {
        id: "listings",
        header: "Listings",
        meta: { label: "Listings", className: "text-end" },
        cell: ({ row: { original: p } }) => <span className="tabular">{p.listings}</span>,
      },
      {
        id: "published",
        header: "Published",
        meta: { label: "Published" },
        cell: ({ row: { original: p } }) => <PublishedPill published={p.isPublished} />,
      },
      {
        id: "updated",
        header: "Updated",
        meta: { sortKey: "updated", label: "Updated" },
        cell: ({ row: { original: p } }) => (
          <span className="whitespace-nowrap text-text-muted">
            {updatedFormat.format(new Date(p.updatedAt))}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      tableId="projects"
      columns={columns}
      rows={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      sort={sort}
      getRowId={(r) => r.id}
      onRowClick={(r) => router.push(`/admin/projects/${r.id}`)}
      searchPlaceholder="Search projects"
      toolbar={
        <>
          <UrlFilterSelect
            param="status"
            label="Status"
            options={projectStatuses.map((s) => ({ value: s, label: projectStatusLabels[s] }))}
          />
          <UrlFilterSelect
            param="developer"
            label="Developer"
            options={developers.map((d) => ({ value: d.id, label: d.name }))}
          />
          <UrlFilterSelect
            param="area"
            label="Area"
            options={areas.map((a) => ({ value: a.id, label: a.name }))}
          />
          <UrlFilterSelect
            param="published"
            label="Published"
            options={[
              { value: "1", label: "Published" },
              { value: "0", label: "Not published" },
            ]}
          />
          {!readOnly && <NewProjectDialog developers={developers} locations={locations} />}
        </>
      }
      empty="No projects match these filters."
    />
  );
}
