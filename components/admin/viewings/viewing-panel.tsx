"use client";

import { ExternalLinkIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { SelectField, TextareaField } from "@/components/admin/fields";
import { SidePanel } from "@/components/admin/side-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  moveViewingAction,
  saveViewingNotesAction,
  setViewingStatusAction,
} from "@/features/viewings/admin-actions";
import type { CalendarViewing } from "@/features/viewings/admin";
import { agencyParts, hhmm } from "@/features/viewings/calendar-time";
import { statusLabel } from "./viewings-calendar";

const NO_AGENT = "none";

/**
 * One viewing (09 §5 "viewing panel"): who, what, when (agency time), the status buttons,
 * moving it (the keyboard way to do what dragging does), notes and the visitor's feedback.
 */
export function ViewingPanel(props: {
  viewing: CalendarViewing | null;
  timeZone: string;
  agents: Array<{ id: string; name: string }>;
  readOnly: boolean;
  onClose: () => void;
}) {
  if (!props.viewing)
    return (
      <SidePanel open={false} onOpenChange={() => props.onClose()} title="Viewing">
        {null}
      </SidePanel>
    );
  // A fresh form for each viewing, and again after it changes.
  const v = props.viewing;
  return (
    <PanelBody key={`${v.id}:${v.startsAt}:${v.status}:${v.agentId}`} {...props} viewing={v} />
  );
}

function PanelBody({
  viewing: v,
  timeZone,
  agents,
  readOnly,
  onClose,
}: {
  viewing: CalendarViewing;
  timeZone: string;
  agents: Array<{ id: string; name: string }>;
  readOnly: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const ids = useId();
  const start = agencyParts(v.startsAt, timeZone);
  const [notes, setNotes] = useState(v.notes ?? "");
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(hhmm(start.minutes));
  const [agentId, setAgentId] = useState<string>(v.agentId ?? NO_AGENT);
  const [busy, setBusy] = useState(false);
  const [force, setForce] = useState<string | null>(null);

  const locked = readOnly || v.status === "cancelled" || v.status === "done";
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(v.startsAt));

  async function status(next: "confirmed" | "done" | "no_show" | "cancelled") {
    setBusy(true);
    const res = await setViewingStatusAction({ id: v.id, status: next });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Marked ${statusLabel[next].toLowerCase()}`);
    router.refresh();
  }

  async function move(confirmed = false) {
    setBusy(true);
    const res = await moveViewingAction({
      id: v.id,
      when: { date, time },
      agentId: agentId === NO_AGENT ? null : agentId,
      force: confirmed,
    });
    setBusy(false);
    if (res.ok) {
      setForce(null);
      toast.success("Viewing moved");
      return router.refresh();
    }
    if (res.code === "OUTSIDE_FREE_TIMES") return setForce(res.error);
    toast.error(res.error);
  }

  async function saveNotes() {
    setBusy(true);
    const res = await saveViewingNotesAction({ id: v.id, notes });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Notes saved");
    router.refresh();
  }

  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${v.contactName}: ${v.what}`}
      description={`${when} · ${statusLabel[v.status]}`}
    >
      <div className="flex flex-col gap-5 text-[14px]">
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
          <dt className="text-text-muted">Status</dt>
          <dd className="font-semibold text-ink">{statusLabel[v.status]}</dd>
          <dt className="text-text-muted">When</dt>
          <dd>{when}</dd>
          <dt className="text-text-muted">How</dt>
          <dd>
            {v.type === "video" ? "Video tour" : "In person"}
            {v.meetingUrl && (
              <>
                {" · "}
                <a href={v.meetingUrl} className="underline underline-offset-2">
                  meeting link
                </a>
              </>
            )}
          </dd>
          <dt className="text-text-muted">Agent</dt>
          <dd>{v.agentName ?? "The agency"}</dd>
          <dt className="text-text-muted">Visitor</dt>
          <dd>
            {v.contactName}
            {v.contactPhone && (
              <>
                {" · "}
                <a href={`tel:${v.contactPhone}`} className="underline underline-offset-2">
                  {v.contactPhone}
                </a>
              </>
            )}
            {v.contactEmail && (
              <>
                {" · "}
                <a href={`mailto:${v.contactEmail}`} className="underline underline-offset-2">
                  {v.contactEmail}
                </a>
              </>
            )}
          </dd>
          <dt className="text-text-muted">Booked by</dt>
          <dd>
            {v.source === "admin" ? "The team" : v.source === "site" ? "The visitor" : v.source}
          </dd>
        </dl>

        {v.leadId && (
          <Link
            href={`/admin/leads/${v.leadId}`}
            className="inline-flex items-center gap-1 font-semibold text-accent underline-offset-4 hover:underline"
          >
            Open the lead <ExternalLinkIcon className="size-3.5" aria-hidden />
          </Link>
        )}

        {v.feedbackRating && (
          <section aria-label="Feedback" className="rounded-md bg-surface-muted p-3">
            <p className="flex items-center gap-1 font-semibold text-ink">
              <StarIcon className="size-4 fill-accent text-accent" aria-hidden />
              {v.feedbackRating} out of 5
            </p>
            {v.feedbackText && <p className="mt-1 text-text">{v.feedbackText}</p>}
          </section>
        )}

        {!locked && (
          <section aria-label="Status" className="flex flex-wrap gap-2">
            {v.status === "requested" && (
              <Button size="sm" disabled={busy} onClick={() => void status("confirmed")}>
                Confirm
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void status("done")}>
              Mark done
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void status("no_show")}
            >
              No-show
            </Button>
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="ghost" className="text-danger" disabled={busy}>
                  Cancel viewing
                </Button>
              }
              title="Cancel this viewing?"
              description="The visitor is told by email, and it leaves the agent's calendar."
              confirmLabel="Cancel viewing"
              destructive
              onConfirm={() => status("cancelled")}
            />
          </section>
        )}

        {!locked && (
          <section aria-label="Move" className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 className="text-[13px] font-semibold text-ink">Move</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5" htmlFor={`${ids}-date`}>
                <span className="text-[13px] font-medium text-ink">Day</span>
                <Input
                  id={`${ids}-date`}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5" htmlFor={`${ids}-time`}>
                <span className="text-[13px] font-medium text-ink">Time (agency time)</span>
                <Input
                  id={`${ids}-time`}
                  type="time"
                  step={300}
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            </div>
            <SelectField
              label="Agent"
              value={agentId}
              onChange={setAgentId}
              options={[
                { value: NO_AGENT, label: "The agency" },
                ...agents.map((a) => ({ value: a.id, label: a.name })),
              ]}
            />
            {force ? (
              <div className="flex flex-col gap-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-[13px] text-danger">
                <p>{force}</p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy} onClick={() => void move(true)}>
                    Move anyway
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setForce(null)}>
                    Pick another time
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                disabled={busy || !date || !time}
                onClick={() => void move()}
              >
                Move viewing
              </Button>
            )}
          </section>
        )}

        <section aria-label="Notes" className="flex flex-col gap-2 border-t border-border pt-4">
          <TextareaField
            label="Notes"
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={setNotes}
          />
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              disabled={busy || notes === (v.notes ?? "")}
              onClick={() => void saveNotes()}
            >
              Save notes
            </Button>
          )}
        </section>
      </div>
    </SidePanel>
  );
}
