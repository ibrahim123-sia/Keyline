"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { DataTable, UrlFilterSelect, type ColumnDef } from "@/components/admin/data-table";
import { SidePanel } from "@/components/admin/side-panel";
import { Input } from "@/components/ui/input";
import type { AuditRow } from "@/features/audit/queries";

const entityLabels: Record<string, string> = {
  settings: "Settings",
  secret: "Integration key",
  user: "Admin",
  media: "File",
  location: "Location",
  poi: "Place",
  developer: "Developer",
  agent: "Agent",
  lead_stage: "Pipeline stage",
  api_token: "API token",
  property_type: "Property type",
  facility: "Facility",
  badge: "Badge",
  poi_type: "POI type",
};

const verbLabels: Record<string, string> = {
  create: "created",
  update: "changed",
  delete: "deleted",
  reorder: "reordered",
  merge: "merged",
  invite: "invited",
  invite_resend: "invite sent again",
  reset_2fa: "two-step verification reset",
  activate: "shown",
  deactivate: "deactivated",
  reactivate: "reactivated",
  upload: "uploaded",
  replace: "replaced",
  move: "moved",
  crops: "crops changed",
  revoke: "revoked",
  import_google: "imported from Google",
  create_defaults: "default pipeline created",
  promote: "made an admin",
  theme: "theme changed",
};

const words = (s: string) => s.replace(/[_-]+/g, " ");

/** "location.update" -> "Location changed". */
export function describeAction(action: string, entityType: string): string {
  const verb = action.includes(".") ? action.slice(action.indexOf(".") + 1) : action;
  const entity =
    entityLabels[entityType] ?? words(entityType).replace(/^./, (c) => c.toUpperCase());
  return `${entity} ${verbLabels[verb] ?? words(verb)}`;
}

function entityHref(entityType: string, entityId: string | null): string | null {
  switch (entityType) {
    case "settings":
      return entityId ? `/admin/settings/${entityId}` : null;
    case "developer":
      return "/admin/setup/developers";
    case "agent":
      return "/admin/setup/agents";
    case "location":
      return "/admin/setup/locations";
    case "poi":
      return "/admin/setup/pois";
    case "media":
      return "/admin/media";
    case "user":
    case "api_token":
      return "/admin/settings/users";
    case "lead_stage":
      return "/admin/settings/leads";
    case "secret":
      return "/admin/settings/integrations";
    default:
      return null;
  }
}

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium" });

function who(row: AuditRow): string {
  if (row.actorType === "system") return "System";
  if (row.actorType === "ai")
    return `AI assistant${row.confirmedByName ? `, confirmed by ${row.confirmedByName}` : ""}`;
  return row.actorName ?? "Deleted admin";
}

function show(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "empty";
  if (typeof value === "string") return value.length > 400 ? `${value.slice(0, 400)}…` : value;
  const text = JSON.stringify(value, null, 2);
  return text.length > 1200 ? `${text.slice(0, 1200)}…` : text;
}

const asRecord = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Settings -> Audit log (04 §12): who changed what, when, with before and after. */
export function AuditLog({
  rows,
  total,
  page,
  pageSize,
  sort,
  modules,
  actors,
}: {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: { id: string; desc: boolean };
  modules: string[];
  actors: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState<AuditRow | null>(null);
  const columns = useMemo<ColumnDef<AuditRow, unknown>[]>(
    () => [
      {
        id: "when",
        header: "When",
        meta: { sortKey: "newest", label: "When", className: "whitespace-nowrap" },
        cell: ({ row }) => when.format(new Date(row.original.createdAt)),
      },
      {
        id: "who",
        header: "Who",
        meta: { label: "Who" },
        cell: ({ row }) => who(row.original),
      },
      {
        id: "what",
        header: "What",
        meta: { label: "What" },
        cell: ({ row }) => (
          <span className="font-medium text-ink">
            {describeAction(row.original.action, row.original.entityType)}
          </span>
        ),
      },
      {
        id: "changes",
        header: "Changes",
        meta: { label: "Changes" },
        cell: ({ row }) =>
          row.original.changedKeys.length ? (
            <span className="text-text-muted">
              {row.original.changedKeys.slice(0, 4).join(", ")}
              {row.original.changedKeys.length > 4
                ? ` +${row.original.changedKeys.length - 4}`
                : ""}
            </span>
          ) : (
            <span className="text-text-muted">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <>
      <DataTable
        tableId="audit"
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        getRowId={(r) => r.id}
        onRowClick={setOpen}
        searchPlaceholder="Search actions"
        toolbar={
          <>
            <UrlFilterSelect
              param="actor"
              label="Who"
              options={[
                ...actors.map((a) => ({ value: a.id, label: a.name })),
                { value: "ai", label: "AI assistant" },
                { value: "system", label: "System" },
              ]}
            />
            <UrlFilterSelect
              param="module"
              label="Module"
              options={modules.map((m) => ({ value: m, label: entityLabels[m] ?? words(m) }))}
            />
            <DateFilter param="from" label="From" />
            <DateFilter param="to" label="To" />
          </>
        }
        empty="Nothing in the log for these filters."
      />

      <SidePanel
        wide
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open ? describeAction(open.action, open.entityType) : "Change"}
      >
        {open && <AuditDetails row={open} />}
      </SidePanel>
    </>
  );
}

function AuditDetails({ row }: { row: AuditRow }) {
  const before = asRecord(row.before);
  const after = asRecord(row.after);
  const keys = row.changedKeys;
  const href = entityHref(row.entityType, row.entityId);
  return (
    <div className="flex flex-col gap-5 text-[13px]">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-text-muted">When</dt>
        <dd>{when.format(new Date(row.createdAt))}</dd>
        <dt className="text-text-muted">Who</dt>
        <dd>{who(row)}</dd>
        <dt className="text-text-muted">Action</dt>
        <dd className="font-mono text-[12px]">{row.action}</dd>
        {row.entityId && (
          <>
            <dt className="text-text-muted">Item</dt>
            <dd className="font-mono text-[12px] break-all">
              {href ? (
                <Link href={href} className="underline underline-offset-2 hover:text-ink">
                  {row.entityId}
                </Link>
              ) : (
                row.entityId
              )}
            </dd>
          </>
        )}
        {row.ip && (
          <>
            <dt className="text-text-muted">From</dt>
            <dd>
              {row.ip}
              {row.userAgent ? (
                <span className="block text-[12px] text-text-muted">{row.userAgent}</span>
              ) : null}
            </dd>
          </>
        )}
      </dl>

      {keys.length === 0 ? (
        <p className="text-text-muted">No field-level details for this entry.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-[12.5px]">
            <thead className="bg-surface-soft text-text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  Field
                </th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  Before
                </th>
                <th scope="col" className="px-3 py-2 text-start font-semibold">
                  After
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k} className="border-t border-border align-top">
                  <th scope="row" className="px-3 py-2 text-start font-medium text-ink">
                    {k}
                  </th>
                  <td className="px-3 py-2">
                    <pre className="font-mono text-[12px] break-all whitespace-pre-wrap text-danger">
                      {show(before[k])}
                    </pre>
                  </td>
                  <td className="px-3 py-2">
                    <pre className="font-mono text-[12px] break-all whitespace-pre-wrap text-success">
                      {show(after[k])}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DateFilter({ param, label }: { param: string; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-1.5 text-[13px] text-text-muted">
      {label}
      <Input
        type="date"
        aria-label={`${label} date`}
        className="h-8 w-36"
        value={params.get(param) ?? ""}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value) next.set(param, e.target.value);
          else next.delete(param);
          next.delete("page");
          router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
        }}
      />
    </label>
  );
}
