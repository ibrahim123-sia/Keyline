"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { changeLeadStage } from "@/features/leads/actions";
import { relativeTime } from "@/features/leads/filters";
import type { LeadRow, LeadStageOption } from "@/features/leads/list";
import type { CurrencyFormat } from "@/lib/money";
import { ScoreBadge } from "./score-badge";
import { StageMoveDialog } from "./stage-move-dialog";

const NO_STAGE = "none";

function Card({
  lead,
  stages,
  readOnly,
  onMove,
  now,
}: {
  lead: LeadRow;
  stages: LeadStageOption[];
  readOnly?: boolean;
  onMove: (lead: LeadRow, stageId: string) => void;
  now: Date;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    disabled: readOnly,
  });
  return (
    <article
      ref={setNodeRef}
      aria-label={lead.name}
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-xs",
        isDragging && "z-10 opacity-80 shadow-md",
        lead.overdue && "border-danger/60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0" {...listeners} {...attributes} aria-label={`Drag ${lead.name}`}>
          <Link
            href={`/admin/leads/${lead.id}`}
            className="block truncate text-[13.5px] font-semibold text-ink hover:underline"
          >
            {lead.name}
          </Link>
          <p className="truncate text-[12px] text-text-muted">{lead.interest}</p>
        </div>
        <ScoreBadge score={lead.score} reasons={lead.scoreReason} />
      </div>
      <div className="flex items-center justify-between gap-2 text-[12px] text-text-muted">
        <span className="truncate">{lead.agentName ?? "Not assigned"}</span>
        <span className={cn("shrink-0", lead.overdue && "font-semibold text-danger")}>
          {lead.waiting
            ? `Waiting ${relativeTime(lead.createdAt, now).replace(" ago", "")}`
            : relativeTime(lead.lastActivityAt, now)}
        </span>
      </div>
      {!readOnly && (
        <select
          aria-label={`Move ${lead.name}`}
          value={lead.stageId ?? ""}
          onChange={(e) => e.target.value && onMove(lead, e.target.value)}
          className="h-7 rounded-md border border-input bg-surface px-1.5 text-[12px] text-ink"
        >
          {!lead.stageId && <option value="">No stage</option>}
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </article>
  );
}

function Column({
  stage,
  leads,
  children,
}: {
  stage: { id: string; name: string; color: string };
  leads: LeadRow[];
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${stage.name}, ${leads.length} ${leads.length === 1 ? "lead" : "leads"}`}
      className={cn(
        "flex w-72 shrink-0 flex-col gap-2 rounded-lg border border-border bg-muted/40 p-2",
        isOver && "border-accent bg-accent-soft/40",
      )}
    >
      <header className="flex items-center gap-2 px-1 py-1">
        <span
          className="size-2.5 rounded-full"
          style={{ backgroundColor: stage.color }}
          aria-hidden
        />
        <h2 className="text-[13px] font-semibold text-ink">{stage.name}</h2>
        <span className="ms-auto text-[12px] text-text-muted tabular">{leads.length}</span>
      </header>
      <div className="flex min-h-24 flex-col gap-2">{children}</div>
    </section>
  );
}

/**
 * Kanban (09 §4): a column per stage; drag a card (or use its Move menu) to change the stage.
 * Lost asks for the reason and Won for the deal value before the move is saved.
 */
export function LeadsKanban({
  rows,
  stages,
  lostReasons,
  currency,
  readOnly,
  now,
}: {
  now: Date;
  rows: LeadRow[];
  stages: LeadStageOption[];
  lostReasons: string[];
  currency: CurrencyFormat;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(rows);
  const [pending, setPending] = useState<{ lead: LeadRow; stage: LeadStageOption } | null>(null);
  // New rows from the server replace the optimistic ones.
  const [seen, setSeen] = useState(rows);
  if (seen !== rows) {
    setSeen(rows);
    setItems(rows);
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  async function save(
    lead: LeadRow,
    stage: LeadStageOption,
    extra: { lostReason: string | null; dealValue: number | null } = {
      lostReason: null,
      dealValue: null,
    },
  ): Promise<boolean> {
    const before = items;
    setItems((list) =>
      list.map((l) =>
        l.id === lead.id
          ? {
              ...l,
              stageId: stage.id,
              stageName: stage.name,
              stageColor: stage.color,
              status: stage.kind,
            }
          : l,
      ),
    );
    const res = await changeLeadStage({ id: lead.id, stageId: stage.id, ...extra });
    if (!res.ok) {
      setItems(before);
      toast.error(res.error);
      return false;
    }
    toast.success(`${lead.name} moved to ${stage.name}`);
    router.refresh();
    return true;
  }

  function move(lead: LeadRow, stageId: string) {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage || stage.id === lead.stageId) return;
    if (stage.kind === "open") void save(lead, stage);
    else setPending({ lead, stage });
  }

  function onDragEnd(e: DragEndEvent) {
    const lead = items.find((l) => l.id === e.active.id);
    if (!lead || !e.over) return;
    move(lead, String(e.over.id));
  }

  const unstaged = items.filter((l) => !l.stageId || !stages.some((s) => s.id === l.stageId));
  const columns = [
    ...(unstaged.length
      ? [{ id: NO_STAGE, name: "No stage", color: "#9AA3AB", kind: "open" as const }]
      : []),
    ...stages,
  ];
  return (
    <>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-3" role="list" aria-label="Lead stages">
          {columns.map((stage) => {
            const inStage =
              stage.id === NO_STAGE ? unstaged : items.filter((l) => l.stageId === stage.id);
            return (
              <div role="listitem" key={stage.id}>
                <Column stage={stage} leads={inStage}>
                  {inStage.map((lead) => (
                    <Card
                      key={lead.id}
                      lead={lead}
                      stages={stages}
                      readOnly={readOnly}
                      onMove={move}
                      now={now}
                    />
                  ))}
                  {inStage.length === 0 && (
                    <p className="px-1 py-4 text-center text-[12px] text-text-muted">No leads</p>
                  )}
                </Column>
              </div>
            );
          })}
        </div>
      </DndContext>
      <StageMoveDialog
        stage={pending?.stage ?? null}
        lostReasons={lostReasons}
        currency={currency}
        onCancel={() => setPending(null)}
        onConfirm={(extra) =>
          pending ? save(pending.lead, pending.stage, extra) : Promise.resolve(false)
        }
      />
    </>
  );
}
