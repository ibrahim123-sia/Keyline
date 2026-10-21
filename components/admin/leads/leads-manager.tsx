"use client";

import { DownloadIcon, KanbanSquareIcon, TableIcon, TagIcon, UserRoundIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { DataTable, type ColumnDef } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { bulkUpdateLeads, type LeadBulkResult } from "@/features/leads/actions";
import { builtInLeadViews, durationText, relativeTime } from "@/features/leads/filters";
import type { LeadRow, LeadStageOption } from "@/features/leads/list";
import type { SavedView } from "@/features/saved-views/schema";
import { leads as t } from "@/lib/i18n/dictionaries/leads";
import type { CurrencyFormat } from "@/lib/money";
import { LeadFilters, LeadSearch } from "./lead-filters";
import { LeadsKanban } from "./leads-kanban";
import { ScoreBadge } from "./score-badge";
import { StageMoveDialog } from "./stage-move-dialog";

type Option = { id: string; name: string };

export type LeadListOptions = {
  stages: LeadStageOption[];
  agents: Array<Option & { isActive: boolean }>;
  areas: Option[];
  leadTypes: string[];
  lostReasons: string[];
  baseCurrency: CurrencyFormat;
};

const dateFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function report(res: LeadBulkResult, verb: string) {
  if (res.updated > 0)
    toast.success(`${res.updated} ${res.updated === 1 ? "lead" : "leads"} ${verb}`);
  if (res.skipped.length > 0)
    toast.warning(
      `${res.skipped.length} ${res.skipped.length === 1 ? "lead was" : "leads were"} not changed`,
    );
}

export function StageDot({ name, color }: { name: string | null; color: string | null }) {
  if (!name) return <span className="text-text-muted">No stage</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: color ?? "#9AA3AB" }}
        aria-hidden
      />
      {name}
    </span>
  );
}

/** "Website form · Paid search" (the channel from the last touch, else the first). */
export function sourceText(row: Pick<LeadRow, "source" | "sourceDetail" | "channel">): {
  source: string;
  channel: string | null;
} {
  return {
    source: t.sources[row.source] + (row.sourceDetail ? ` (${row.sourceDetail})` : ""),
    channel: row.channel ? t.channels[row.channel] : null,
  };
}

/** How long the first reply took, or how long they have waited (red past the limit). */
export function ResponseCell({ row, now }: { row: LeadRow; now: Date }) {
  if (row.responseSeconds !== null)
    return <span className="tabular">{durationText(row.responseSeconds)}</span>;
  if (!row.waiting) return <span className="text-text-muted">—</span>;
  const waited = (now.getTime() - new Date(row.createdAt).getTime()) / 1000;
  return (
    <span
      className={cn(
        "whitespace-nowrap tabular",
        row.overdue ? "font-semibold text-danger" : "text-text-muted",
      )}
    >
      Waiting {durationText(waited)}
    </span>
  );
}

function ViewToggle({ view }: { view: "table" | "board" }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const href = (v: "table" | "board") => {
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    if (v === "board") next.set("view", "board");
    else next.delete("view");
    return `${pathname}${next.size ? `?${next}` : ""}`;
  };
  const item = (v: "table" | "board", label: string, icon: ReactNode) => (
    <Link
      href={href(v)}
      aria-current={view === v ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px]",
        view === v
          ? "bg-surface font-semibold text-ink shadow-xs"
          : "text-text-muted hover:text-ink",
      )}
    >
      {icon}
      {label}
    </Link>
  );
  return (
    <nav aria-label="Leads view" className="inline-flex rounded-lg bg-muted p-0.5">
      {item("table", "Table", <TableIcon className="size-4" aria-hidden />)}
      {item("board", "Board", <KanbanSquareIcon className="size-4" aria-hidden />)}
    </nav>
  );
}

/** Admin -> Leads (09 §4): a table or a board, with filters, saved views and bulk actions. */
export function LeadsManager({
  view,
  rows,
  total,
  page,
  pageSize,
  sort,
  options,
  savedViews,
  readOnly,
  now: nowIso,
  bulkExtra,
}: {
  view: "table" | "board";
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: { id: string; desc: boolean };
  options: LeadListOptions;
  savedViews: SavedView[];
  readOnly?: boolean;
  now: string;
  /** More bulk actions (merge). */
  bulkExtra?: (ids: string[], clear: () => void) => ReactNode;
}) {
  const router = useRouter();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [stageFor, setStageFor] = useState<{
    ids: string[];
    clear: () => void;
    stage: LeadStageOption;
  } | null>(null);
  const [tagFor, setTagFor] = useState<{ ids: string[]; clear: () => void } | null>(null);
  const [tag, setTag] = useState("");

  async function bulk(
    ids: string[],
    action: Parameters<typeof bulkUpdateLeads>[0]["action"],
    verb: string,
    clear: () => void,
  ): Promise<boolean> {
    const res = await bulkUpdateLeads({ ids, action });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    report(res.data, verb);
    clear();
    router.refresh();
    return true;
  }

  const filters = (
    <LeadFilters
      stages={options.stages}
      agents={options.agents}
      areas={options.areas}
      leadTypes={options.leadTypes}
      currencyCode={options.baseCurrency.code}
    />
  );

  const columns = useMemo<ColumnDef<LeadRow, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        meta: { sortKey: "name", label: "Name" },
        cell: ({ row: { original: l } }) => (
          <div className="min-w-44">
            <Link
              href={`/admin/leads/${l.id}`}
              onClick={(e) => e.stopPropagation()}
              className="block truncate font-semibold text-ink hover:underline"
            >
              {l.name}
            </Link>
            <p className="truncate text-[12px] text-text-muted">{l.email ?? l.phone ?? ""}</p>
          </div>
        ),
      },
      {
        id: "type",
        header: "Type",
        meta: { label: "Type" },
        cell: ({ row: { original: l } }) => <span className="capitalize">{l.type}</span>,
      },
      {
        id: "source",
        header: "Source",
        meta: { label: "Source and channel" },
        cell: ({ row: { original: l } }) => {
          const s = sourceText(l);
          return (
            <div className="min-w-32">
              <p className="truncate">{s.source}</p>
              {s.channel && (
                <p className="truncate text-[12px] text-text-muted">
                  {s.channel}
                  {l.campaign ? ` · ${l.campaign}` : ""}
                </p>
              )}
            </div>
          );
        },
      },
      {
        id: "interest",
        header: "Interest",
        meta: { label: "Interest" },
        cell: ({ row: { original: l } }) => (
          <span className="line-clamp-2 min-w-40">{l.interest}</span>
        ),
      },
      {
        id: "score",
        header: "Score",
        meta: { sortKey: "score", label: "Score" },
        cell: ({ row: { original: l } }) => <ScoreBadge score={l.score} reasons={l.scoreReason} />,
      },
      {
        id: "stage",
        header: "Stage",
        meta: { label: "Stage" },
        cell: ({ row: { original: l } }) => <StageDot name={l.stageName} color={l.stageColor} />,
      },
      {
        id: "agent",
        header: "Agent",
        meta: { label: "Agent" },
        cell: ({ row: { original: l } }) =>
          l.agentName ?? <span className="text-text-muted">Not assigned</span>,
      },
      {
        id: "activity",
        header: "Last activity",
        meta: { sortKey: "activity", label: "Last activity" },
        cell: ({ row: { original: l } }) => (
          <span className="whitespace-nowrap text-text-muted">
            {relativeTime(l.lastActivityAt, now)}
          </span>
        ),
      },
      {
        id: "next_task",
        header: "Next task",
        meta: { sortKey: "next_task", label: "Next task" },
        cell: ({ row: { original: l } }) =>
          l.nextTaskAt ? (
            <span
              className={cn(
                "whitespace-nowrap",
                new Date(l.nextTaskAt) < now ? "font-semibold text-danger" : "text-ink",
              )}
            >
              {dateFormat.format(new Date(l.nextTaskAt))}
            </span>
          ) : (
            <span className="text-text-muted">—</span>
          ),
      },
      {
        id: "response",
        header: "Response",
        meta: { label: "Response time" },
        cell: ({ row: { original: l } }) => <ResponseCell row={l} now={now} />,
      },
    ],
    [now],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ViewToggle view={view} />
      </div>
      {view === "board" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <LeadSearch />
            {filters}
          </div>
          <LeadsKanban
            rows={rows}
            stages={options.stages}
            lostReasons={options.lostReasons}
            currency={options.baseCurrency}
            readOnly={readOnly}
          />
        </>
      ) : (
        <DataTable
          tableId="leads"
          columns={columns}
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          sort={sort}
          getRowId={(r) => r.id}
          onRowClick={(r) => router.push(`/admin/leads/${r.id}`)}
          searchPlaceholder="Search name, email or phone"
          views={builtInLeadViews}
          savedViews={{ tableId: "leads", items: savedViews, canEdit: !readOnly }}
          toolbar={filters}
          bulkActions={(ids, clear) => (
            <>
              {!readOnly && (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <UserRoundIcon aria-hidden /> Assign
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {options.agents
                        .filter((a) => a.isActive)
                        .map((a) => (
                          <DropdownMenuItem
                            key={a.id}
                            onSelect={() =>
                              void bulk(
                                ids,
                                { type: "assign", agentId: a.id },
                                `assigned to ${a.name}`,
                                clear,
                              )
                            }
                          >
                            {a.name}
                          </DropdownMenuItem>
                        ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() =>
                          void bulk(ids, { type: "assign", agentId: null }, "unassigned", clear)
                        }
                      >
                        Nobody
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        Change stage
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {options.stages.map((s) => (
                        <DropdownMenuItem
                          key={s.id}
                          onSelect={() =>
                            s.kind === "open"
                              ? void bulk(
                                  ids,
                                  {
                                    type: "stage",
                                    stageId: s.id,
                                    lostReason: null,
                                    dealValue: null,
                                  },
                                  `moved to ${s.name}`,
                                  clear,
                                )
                              : setStageFor({ ids, clear, stage: s })
                          }
                        >
                          <StageDot name={s.name} color={s.color} />
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="outline" size="sm" onClick={() => setTagFor({ ids, clear })}>
                    <TagIcon aria-hidden /> Add tag
                  </Button>
                </>
              )}
              <Button asChild variant="outline" size="sm">
                <a href={`/api/admin/leads/export?ids=${ids.join(",")}`}>
                  <DownloadIcon aria-hidden /> Export
                </a>
              </Button>
              {bulkExtra?.(ids, clear)}
            </>
          )}
        />
      )}

      <StageMoveDialog
        stage={stageFor?.stage ?? null}
        count={stageFor?.ids.length ?? 1}
        lostReasons={options.lostReasons}
        currency={options.baseCurrency}
        onCancel={() => setStageFor(null)}
        onConfirm={(extra) =>
          stageFor
            ? bulk(
                stageFor.ids,
                { type: "stage", stageId: stageFor.stage.id, ...extra },
                `moved to ${stageFor.stage.name}`,
                stageFor.clear,
              )
            : Promise.resolve(false)
        }
      />
      <Dialog open={tagFor !== null} onOpenChange={(o) => !o && setTagFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a tag</DialogTitle>
            <DialogDescription>
              To {tagFor?.ids.length ?? 0} {tagFor?.ids.length === 1 ? "lead" : "leads"}.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!tagFor || !tag.trim()) return;
              if (
                await bulk(
                  tagFor.ids,
                  { type: "tag", tag: tag.trim() },
                  `tagged “${tag.trim()}”`,
                  tagFor.clear,
                )
              ) {
                setTagFor(null);
                setTag("");
              }
            }}
          >
            <Input
              aria-label="Tag"
              value={tag}
              maxLength={40}
              onChange={(e) => setTag(e.target.value)}
            />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setTagFor(null)}>
                Cancel
              </Button>
              <Button type="submit">Add tag</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
