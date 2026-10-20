"use client";

import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BadgeCheckIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  StarIcon,
  StarOffIcon,
  UploadIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataTable, UrlFilterSelect, type ColumnDef } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { propertyStatuses, type PropertyStatus } from "@/db/schema/properties";
import {
  bulkUpdateProperties,
  duplicateProperty,
  type BulkResult,
} from "@/features/properties/actions";
import { bedsLabel, priceLabel } from "@/features/properties/format";
import type { PropertyRow } from "@/features/properties/queries";
import { isLiveStatus, statusLabels } from "@/features/properties/status";
import type { SavedView } from "@/features/saved-views/schema";
import type { CurrencyFormat } from "@/lib/money";
import { NewPropertyDialog } from "./new-property-dialog";
import { StatusPill } from "./status-pill";

type Option = { id: string; name: string };

const updatedFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" });

/** Built-in views (07 §2); the agency can save its own next to them. */
const builtInViews: Array<{ label: string; params: Record<string, string> }> = [
  { label: "Drafts", params: { status: "draft" } },
  { label: "Needs verification", params: { verifiedOlder: "30" } },
  { label: "Off-plan", params: { completion: "off_plan" } },
  { label: "No photos", params: { noPhotos: "1" } },
  { label: "Archived", params: { archived: "1" } },
];

function UrlToggle({ param, label }: { param: string; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const on = params.get(param) === "1";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        const next = new URLSearchParams(params.toString());
        if (on) next.delete(param);
        else next.set(param, "1");
        next.delete("page");
        router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
      }}
      className={cn(
        "h-8 rounded-lg border px-2.5 text-[13px] transition-colors",
        on
          ? "border-accent bg-accent-soft text-ink"
          : "border-input bg-surface text-text-muted hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

function reportBulk(res: BulkResult, verb: string) {
  if (res.updated > 0)
    toast.success(`${res.updated} ${res.updated === 1 ? "listing" : "listings"} ${verb}`);
  if (res.skipped.length > 0) {
    toast.warning(
      `${res.skipped.length} ${res.skipped.length === 1 ? "listing was" : "listings were"} not changed`,
      {
        description: res.skipped
          .slice(0, 4)
          .map((s) => `${s.reference}: ${s.reason}`)
          .join("\n"),
        duration: 12_000,
      },
    );
  }
}

/** Admin -> Properties (07 §2). */
export function PropertiesManager({
  rows,
  total,
  page,
  pageSize,
  sort,
  types,
  areas,
  agents,
  badges,
  currencies,
  savedViews,
  archived,
  readOnly,
}: {
  rows: PropertyRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: { id: string; desc: boolean };
  types: Option[];
  areas: Option[];
  agents: Array<Option & { isActive: boolean }>;
  badges: Option[];
  currencies: Record<string, CurrencyFormat>;
  savedViews: SavedView[];
  archived: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const exportHref = `/api/admin/properties/export${search.size ? `?${search}` : ""}`;
  const [confirmArchive, setConfirmArchive] = useState<{ ids: string[]; clear: () => void } | null>(
    null,
  );

  async function bulk(
    ids: string[],
    action: Parameters<typeof bulkUpdateProperties>[0]["action"],
    verb: string,
    clear?: () => void,
  ) {
    const res = await bulkUpdateProperties({ ids, action });
    if (!res.ok) return toast.error(res.error);
    reportBulk(res.data, verb);
    clear?.();
    router.refresh();
  }

  const columns = useMemo<ColumnDef<PropertyRow, unknown>[]>(
    () => [
      {
        id: "listing",
        header: "Listing",
        meta: { sortKey: "title", label: "Listing" },
        cell: ({ row: { original: p } }) => (
          <div className="flex min-w-64 items-center gap-3">
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
                href={`/admin/properties/${p.id}`}
                onClick={(e) => e.stopPropagation()}
                className="block truncate font-semibold text-ink hover:underline"
              >
                {p.title || "Untitled listing"}
              </Link>
              <p className="truncate text-[12px] text-text-muted">
                <span className="tabular">{p.reference}</span>
                {p.typeName ? ` · ${p.typeName}` : ""}
                {p.isFeatured ? " · Featured" : ""}
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "purpose",
        header: "Purpose",
        meta: { label: "Purpose" },
        cell: ({ row: { original: p } }) => (
          <span className="whitespace-nowrap">
            {p.purpose === "sale" ? "Sale" : "Rent"}
            {p.completion === "off_plan" && (
              <span className="block text-[12px] text-text-muted">Off-plan</span>
            )}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row: { original: p } }) =>
          p.archived ? (
            <span className="text-[12px] font-semibold text-text-muted">Archived</span>
          ) : (
            <StatusPill status={p.status} />
          ),
      },
      {
        id: "price",
        header: "Price",
        meta: { sortKey: "price", label: "Price", className: "text-end" },
        cell: ({ row: { original: p } }) => (
          <span className="whitespace-nowrap tabular">{priceLabel(p, currencies)}</span>
        ),
      },
      {
        id: "area",
        header: "Area",
        meta: { label: "Area" },
        cell: ({ row: { original: p } }) =>
          p.locationName ?? <span className="text-text-muted">—</span>,
      },
      {
        id: "beds",
        header: "Beds",
        meta: { label: "Beds" },
        cell: ({ row: { original: p } }) => bedsLabel(p.beds),
      },
      {
        id: "agent",
        header: "Agent",
        meta: { label: "Agent" },
        cell: ({ row: { original: p } }) =>
          p.agentName ?? <span className="text-text-muted">Not assigned</span>,
      },
      {
        id: "verified",
        header: "Verified",
        meta: { label: "Verified" },
        cell: ({ row: { original: p } }) =>
          p.verifiedDays == null ? (
            <span className="text-text-muted">Not verified</span>
          ) : (
            <span
              className={cn("whitespace-nowrap", p.verifiedDays > 30 && "text-accent")}
              title={p.lastVerifiedAt ?? undefined}
            >
              {p.verifiedDays === 0
                ? "Today"
                : `${p.verifiedDays} ${p.verifiedDays === 1 ? "day" : "days"} ago`}
            </span>
          ),
      },
      {
        id: "views",
        header: "Views (30d)",
        meta: { sortKey: "views", label: "Views (30 days)", className: "text-end" },
        cell: ({ row: { original: p } }) => <span className="tabular">{p.views30}</span>,
      },
      {
        id: "inquiries",
        header: "Inquiries (30d)",
        meta: { sortKey: "inquiries", label: "Inquiries (30 days)", className: "text-end" },
        cell: ({ row: { original: p } }) => <span className="tabular">{p.inquiries30}</span>,
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
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableHiding: false,
        cell: ({ row: { original: p } }) => (
          <RowActions
            row={p}
            readOnly={readOnly}
            onDuplicate={async () => {
              const res = await duplicateProperty({ id: p.id });
              if (!res.ok) return toast.error(res.error);
              toast.success(`Copy ${res.data.reference} created`);
              router.push(`/admin/properties/${res.data.id}`);
            }}
          />
        ),
      },
    ],
    [currencies, readOnly, router],
  );

  return (
    <>
      <DataTable
        tableId="properties"
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`/admin/properties/${r.id}`)}
        searchPlaceholder="Search reference, title or building"
        views={builtInViews}
        savedViews={{ tableId: "properties", items: savedViews, canEdit: !readOnly }}
        toolbar={
          <>
            <UrlFilterSelect
              param="purpose"
              label="Purpose"
              options={[
                { value: "sale", label: "Sale" },
                { value: "rent", label: "Rent" },
              ]}
            />
            <UrlFilterSelect
              param="status"
              label="Status"
              options={propertyStatuses.map((s) => ({ value: s, label: statusLabels[s] }))}
            />
            <UrlFilterSelect
              param="completion"
              label="Completion"
              options={[
                { value: "ready", label: "Ready" },
                { value: "off_plan", label: "Off-plan" },
              ]}
            />
            <UrlFilterSelect
              param="type"
              label="Type"
              options={types.map((t) => ({ value: t.id, label: t.name }))}
            />
            <UrlFilterSelect
              param="area"
              label="Area"
              options={areas.map((a) => ({ value: a.id, label: a.name }))}
            />
            <UrlFilterSelect
              param="agent"
              label="Agent"
              options={[
                { value: "none", label: "Not assigned" },
                ...agents.map((a) => ({ value: a.id, label: a.name })),
              ]}
            />
            <UrlFilterSelect
              param="verifiedOlder"
              label="Verified"
              options={[
                { value: "30", label: "Not in 30 days" },
                { value: "60", label: "Not in 60 days" },
                { value: "90", label: "Not in 90 days" },
              ]}
            />
            <UrlToggle param="missingSeo" label="Missing SEO" />
            <UrlToggle param="featured" label="Featured" />
            <Button asChild variant="outline">
              <a href={exportHref} download>
                <DownloadIcon /> Export CSV
              </a>
            </Button>
            {!readOnly && (
              <Button asChild variant="outline">
                <Link href="/admin/properties/import">
                  <UploadIcon /> Import
                </Link>
              </Button>
            )}
            {!readOnly && <NewPropertyDialog types={types} />}
          </>
        }
        bulkActions={
          readOnly
            ? undefined
            : (ids, clear) =>
                archived ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => bulk(ids, { type: "restore" }, "restored", clear)}
                    >
                      <ArchiveRestoreIcon /> Restore
                    </Button>
                    <ExportSelected ids={ids} />
                  </>
                ) : (
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline">
                          Change status
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {propertyStatuses.map((s) => (
                          <DropdownMenuItem
                            key={s}
                            onSelect={() =>
                              bulk(
                                ids,
                                { type: "status", status: s },
                                `set to ${statusLabels[s].toLowerCase()}`,
                                clear,
                              )
                            }
                          >
                            {statusLabels[s]}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline">
                          Assign agent
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {agents
                          .filter((a) => a.isActive)
                          .map((a) => (
                            <DropdownMenuItem
                              key={a.id}
                              onSelect={() =>
                                bulk(ids, { type: "agent", agentId: a.id }, "assigned", clear)
                              }
                            >
                              {a.name}
                            </DropdownMenuItem>
                          ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() =>
                            bulk(ids, { type: "agent", agentId: null }, "unassigned", clear)
                          }
                        >
                          No agent
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {badges.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline">
                            Badges
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>Add badge</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {badges.map((b) => (
                                <DropdownMenuItem
                                  key={b.id}
                                  onSelect={() =>
                                    bulk(
                                      ids,
                                      { type: "badge", badgeId: b.id, add: true },
                                      "updated",
                                      clear,
                                    )
                                  }
                                >
                                  {b.name}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>Remove badge</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {badges.map((b) => (
                                <DropdownMenuItem
                                  key={b.id}
                                  onSelect={() =>
                                    bulk(
                                      ids,
                                      { type: "badge", badgeId: b.id, add: false },
                                      "updated",
                                      clear,
                                    )
                                  }
                                >
                                  {b.name}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        bulk(ids, { type: "feature", featured: true }, "featured", clear)
                      }
                    >
                      <StarIcon /> Feature
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        bulk(ids, { type: "feature", featured: false }, "unfeatured", clear)
                      }
                    >
                      <StarOffIcon /> Unfeature
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => bulk(ids, { type: "verify" }, "marked verified", clear)}
                    >
                      <BadgeCheckIcon /> Mark verified
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-danger"
                      onClick={() => setConfirmArchive({ ids, clear })}
                    >
                      <ArchiveIcon /> Archive
                    </Button>
                    <ExportSelected ids={ids} />
                  </>
                )
        }
        empty={archived ? "No archived listings." : "No listings match these filters."}
      />
      <ConfirmDialog
        open={confirmArchive !== null}
        onOpenChange={(o) => !o && setConfirmArchive(null)}
        title={`Archive ${confirmArchive?.ids.length ?? 0} ${confirmArchive?.ids.length === 1 ? "listing" : "listings"}?`}
        description="They leave the site and this list. You can restore them from the Archived view."
        confirmLabel="Archive"
        destructive
        onConfirm={async () => {
          if (confirmArchive)
            await bulk(confirmArchive.ids, { type: "archive" }, "archived", confirmArchive.clear);
          setConfirmArchive(null);
        }}
      />
    </>
  );
}

/** Selected rows as CSV (07 §7 "CSV export of any filtered list"). */
function ExportSelected({ ids }: { ids: string[] }) {
  return (
    <Button asChild size="sm" variant="outline">
      <a href={`/api/admin/properties/export?ids=${ids.join(",")}`} download>
        <DownloadIcon /> Export CSV
      </a>
    </Button>
  );
}

function RowActions({
  row,
  readOnly,
  onDuplicate,
}: {
  row: PropertyRow;
  readOnly?: boolean;
  onDuplicate: () => void;
}) {
  const live = !row.archived && isLiveStatus(row.status as PropertyStatus);
  const publicPath = `/property/${row.slug}`;
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.reference}`}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="tabular">{row.reference}</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={`/admin/properties/${row.id}`}>
              <PencilIcon /> Open
            </Link>
          </DropdownMenuItem>
          {!readOnly && (
            <DropdownMenuItem onSelect={onDuplicate}>
              <CopyIcon /> Duplicate
            </DropdownMenuItem>
          )}
          {live && (
            <>
              <DropdownMenuItem asChild>
                <a href={publicPath} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon /> View on site
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={async () => {
                  try {
                    await navigator.clipboard.writeText(`${window.location.origin}${publicPath}`);
                    toast.success("Link copied");
                  } catch {
                    toast.error("Could not copy the link");
                  }
                }}
              >
                <LinkIcon /> Copy link
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
