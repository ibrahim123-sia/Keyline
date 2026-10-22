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
import { VideoIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { moveViewingAction } from "@/features/viewings/admin-actions";
import { agencyParts, hhmm } from "@/features/viewings/calendar-time";
import type { CalendarViewing } from "@/features/viewings/admin";
import { ViewingPanel } from "./viewing-panel";

export type CalendarColumn = { key: string; label: string; date: string; agentId?: string | null };

const SLOT_MIN = 30;
const SLOT_PX = 28;

/** Status colours (09 §5 "colour by status"). */
export const statusStyle: Record<CalendarViewing["status"], string> = {
  requested: "border-dashed border-accent/60 bg-accent-soft text-ink",
  confirmed: "border-accent/50 bg-accent/10 text-ink",
  done: "border-success/40 bg-success-soft text-ink",
  no_show: "border-border bg-surface-muted text-text-muted",
  cancelled: "border-border bg-surface text-text-muted line-through",
  rescheduled: "border-border bg-surface text-text-muted",
};

export const statusLabel: Record<CalendarViewing["status"], string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  done: "Done",
  no_show: "No-show",
  cancelled: "Cancelled",
  rescheduled: "Moved",
};

function Cell({ id, label }: { id: string; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      aria-label={label}
      className={cn("border-b border-border/60", isOver && "bg-accent/15")}
      style={{ height: SLOT_PX }}
    />
  );
}

function Block({
  v,
  top,
  height,
  timeZone,
  onOpen,
  readOnly,
}: {
  v: CalendarViewing;
  top: number;
  height: number;
  timeZone: string;
  onOpen: () => void;
  readOnly: boolean;
}) {
  const locked = readOnly || v.status === "cancelled" || v.status === "done";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: v.id,
    disabled: locked,
  });
  const time = hhmm(agencyParts(v.startsAt, timeZone).minutes);
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={onOpen}
      aria-label={`${v.contactName}, ${v.what}, ${time}, ${statusLabel[v.status]}${v.type === "video" ? ", video tour" : ""}`}
      className={cn(
        "absolute inset-x-1 z-10 overflow-hidden rounded-md border px-1.5 py-0.5 text-start text-[11.5px] leading-tight shadow-soft",
        statusStyle[v.status],
        isDragging && "z-20 opacity-80",
      )}
      style={{
        top,
        height: Math.max(height, SLOT_PX - 4),
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
      }}
    >
      <span className="flex items-center gap-1 font-semibold">
        {time} {v.type === "video" && <VideoIcon className="size-3" aria-hidden />}
        <span className="truncate">{v.contactName}</span>
      </span>
      <span className="block truncate">{v.what}</span>
    </button>
  );
}

/**
 * Admin -> Viewings calendar (09 §5): days or agents as columns, half hours as rows, coloured
 * by status. Drag to move (a drop outside the agent's free times asks first); click to open.
 */
export function ViewingsCalendar({
  columns,
  viewings,
  timeZone,
  startMin,
  endMin,
  agents,
  readOnly,
}: {
  columns: CalendarColumn[];
  viewings: CalendarViewing[];
  timeZone: string;
  startMin: number;
  endMin: number;
  agents: Array<{ id: string; name: string }>;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    id: string;
    date: string;
    time: string;
    agentId?: string | null;
    message: string;
  } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const rows = Array.from(
    { length: Math.ceil((endMin - startMin) / SLOT_MIN) },
    (_, i) => startMin + i * SLOT_MIN,
  );

  async function move(input: {
    id: string;
    date: string;
    time: string;
    agentId?: string | null;
    force?: boolean;
  }) {
    const res = await moveViewingAction({
      id: input.id,
      when: { date: input.date, time: input.time },
      ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
      force: input.force ?? false,
    });
    if (res.ok) {
      toast.success("Viewing moved");
      setPending(null);
      return router.refresh();
    }
    if (res.code === "OUTSIDE_FREE_TIMES") return setPending({ ...input, message: res.error });
    toast.error(res.error);
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const [colKey, time] = String(e.over.id).split("|");
    const col = columns.find((c) => c.key === colKey);
    const v = viewings.find((x) => x.id === e.active.id);
    if (!col || !v || !time) return;
    const now = agencyParts(v.startsAt, timeZone);
    const sameAgent = col.agentId === undefined || col.agentId === v.agentId;
    if (now.date === col.date && hhmm(now.minutes) === time && sameAgent) return;
    void move({
      id: v.id,
      date: col.date,
      time,
      ...(col.agentId !== undefined ? { agentId: col.agentId } : {}),
    });
  }

  const open = viewings.find((v) => v.id === openId) ?? null;
  const inColumn = (col: CalendarColumn) =>
    viewings.filter((v) => {
      const p = agencyParts(v.startsAt, timeZone);
      return p.date === col.date && (col.agentId === undefined || col.agentId === v.agentId);
    });

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div
            className="grid min-w-[720px]"
            style={{ gridTemplateColumns: `4rem repeat(${columns.length}, minmax(7rem, 1fr))` }}
          >
            <div className="border-b border-border" />
            {columns.map((c) => (
              <div
                key={c.key}
                className="border-s border-b border-border px-2 py-2 text-[12.5px] font-semibold text-ink"
              >
                {c.label}
              </div>
            ))}
            <div>
              {rows.map((m) => (
                <div
                  key={m}
                  className="border-b border-border/60 pe-2 text-end text-[11px] text-text-muted"
                  style={{ height: SLOT_PX }}
                >
                  {m % 60 === 0 ? hhmm(m) : ""}
                </div>
              ))}
            </div>
            {columns.map((c) => (
              <div
                key={c.key}
                role="region"
                aria-label={c.label}
                className="relative border-s border-border"
              >
                {rows.map((m) => (
                  <Cell key={m} id={`${c.key}|${hhmm(m)}`} label={`${c.label} ${hhmm(m)}`} />
                ))}
                {inColumn(c).map((v) => {
                  const s = agencyParts(v.startsAt, timeZone).minutes;
                  const e = s + (Date.parse(v.endsAt) - Date.parse(v.startsAt)) / 60_000;
                  return (
                    <Block
                      key={v.id}
                      v={v}
                      top={((s - startMin) / SLOT_MIN) * SLOT_PX}
                      height={((e - s) / SLOT_MIN) * SLOT_PX - 2}
                      timeZone={timeZone}
                      onOpen={() => setOpenId(v.id)}
                      readOnly={readOnly}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </DndContext>
      </div>

      <ViewingPanel
        viewing={open}
        timeZone={timeZone}
        agents={agents}
        readOnly={readOnly}
        onClose={() => setOpenId(null)}
      />

      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title="Move it anyway?"
          description={`${pending.message} Move to ${pending.date} at ${pending.time} anyway?`}
          confirmLabel="Move anyway"
          onConfirm={() => move({ ...pending, force: true })}
        />
      )}
    </>
  );
}
