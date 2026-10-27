"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { DataTable, type ColumnDef } from "@/components/admin/data-table";
import type { ContactRow } from "@/features/contacts/queries";
import { relativeTime } from "@/features/leads/filters";

/** Admin -> Contacts (09 §4): one row per person; a person can have several leads. */
export function ContactsManager({
  rows,
  total,
  page,
  pageSize,
  sort,
  now,
}: {
  rows: ContactRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: { id: string; desc: boolean };
  now: string;
}) {
  const router = useRouter();
  const at = useMemo(() => new Date(now), [now]);
  const columns = useMemo<ColumnDef<ContactRow, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        meta: { sortKey: "name", label: "Name" },
        cell: ({ row: { original: c } }) => (
          <Link
            href={`/admin/contacts/${c.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-semibold text-ink hover:underline"
          >
            {c.name}
          </Link>
        ),
      },
      {
        id: "email",
        header: "Email",
        meta: { label: "Email" },
        cell: ({ row: { original: c } }) => c.email ?? "—",
      },
      {
        id: "phone",
        header: "Phone",
        meta: { label: "Phone" },
        cell: ({ row: { original: c } }) => c.phone ?? "—",
      },
      {
        id: "leads",
        header: "Leads",
        meta: { label: "Leads", className: "text-end" },
        cell: ({ row: { original: c } }) => (
          <span className="tabular">
            {c.leads}
            {c.openLeads ? ` (${c.openLeads} open)` : ""}
          </span>
        ),
      },
      {
        id: "activity",
        header: "Last activity",
        meta: { sortKey: "activity", label: "Last activity" },
        cell: ({ row: { original: c } }) =>
          c.lastActivityAt ? (
            <span className="whitespace-nowrap text-text-muted">
              {relativeTime(c.lastActivityAt, at)}
            </span>
          ) : (
            <span className="text-text-muted">—</span>
          ),
      },
      {
        id: "created",
        header: "Added",
        meta: { sortKey: "created", label: "Added" },
        cell: ({ row: { original: c } }) => (
          <span className="whitespace-nowrap text-text-muted">{relativeTime(c.createdAt, at)}</span>
        ),
      },
    ],
    [at],
  );
  return (
    <DataTable
      tableId="contacts"
      columns={columns}
      rows={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      sort={sort}
      getRowId={(r) => r.id}
      onRowClick={(r) => router.push(`/admin/contacts/${r.id}`)}
      searchPlaceholder="Search name, email or phone"
    />
  );
}
