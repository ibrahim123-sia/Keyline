"use client";

import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { SelectField, TextInputField } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteOverrideAction, saveOverrideAction } from "@/features/viewings/admin-actions";
import type { OverrideRow } from "@/features/viewings/admin";

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

/**
 * Days an agent is away or works other hours (agent_availability_overrides): the free viewing
 * times follow them at once.
 */
export function TimeOffManager({
  rows,
  agents,
  readOnly,
}: {
  rows: OverrideRow[];
  agents: Array<{ id: string; name: string }>;
  readOnly: boolean;
}) {
  const router = useRouter();
  const ids = useId();
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [blocked, setBlocked] = useState(true);
  const [from, setFrom] = useState("10:00");
  const [to, setTo] = useState("14:00");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    const res = await saveOverrideAction({
      agentId,
      date,
      blocked,
      hours: blocked ? null : [{ from, to }],
      note,
    });
    setBusy(false);
    if (!res.ok) {
      const byField: Record<string, string> = {};
      for (const [path, messages] of Object.entries(res.fieldErrors ?? {}))
        byField[path.split(".")[0]!] = messages[0]!;
      setErrors(byField);
      if (!res.fieldErrors) toast.error(res.error);
      return;
    }
    setErrors({});
    setDate("");
    setNote("");
    toast.success("Saved");
    router.refresh();
  }

  async function remove(id: string) {
    const res = await deleteOverrideAction({ id });
    if (!res.ok) return toast.error(res.error);
    toast.success("Removed");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {!readOnly && (
        <form
          aria-label="Add a day"
          className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField
              label="Agent"
              value={agentId}
              onChange={setAgentId}
              options={agents.map((a) => ({ value: a.id, label: a.name }))}
              error={errors.agentId}
            />
            <label className="flex flex-col gap-1.5" htmlFor={`${ids}-date`}>
              <span className="text-[13px] font-medium text-ink">Day</span>
              <Input
                id={`${ids}-date`}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={errors.date ? true : undefined}
              />
              {errors.date && <span className="text-[12.5px] text-danger">Choose a day</span>}
            </label>
            <TextInputField label="Note" value={note} onChange={setNote} placeholder="e.g. Leave" />
          </div>
          <fieldset className="flex flex-wrap items-end gap-4 text-[14px]">
            <legend className="mb-2 text-[13px] font-medium text-ink">That day</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${ids}-kind`}
                checked={blocked}
                onChange={() => setBlocked(true)}
              />
              Away all day
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${ids}-kind`}
                checked={!blocked}
                onChange={() => setBlocked(false)}
              />
              Other hours
            </label>
            {!blocked && (
              <>
                <label className="flex flex-col gap-1" htmlFor={`${ids}-from`}>
                  <span className="text-[13px] font-medium text-ink">From</span>
                  <Input
                    id={`${ids}-from`}
                    type="time"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1" htmlFor={`${ids}-to`}>
                  <span className="text-[13px] font-medium text-ink">To</span>
                  <Input
                    id={`${ids}-to`}
                    type="time"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </>
            )}
          </fieldset>
          {errors.hours && <p className="text-[12.5px] text-danger">{errors.hours}</p>}
          <Button type="submit" className="self-start" disabled={busy || !agentId || !date}>
            Save day
          </Button>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="text-[14px] text-text-muted">No days off or other hours coming up.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 px-4 py-3 text-[14px]"
            >
              <span>
                <span className="font-semibold text-ink">{r.agentName}</span> · {dateLabel(r.date)}{" "}
                · {r.blocked ? "Away" : (r.hours ?? []).map((h) => `${h.from}-${h.to}`).join(", ")}
                {r.note && <span className="text-text-muted"> · {r.note}</span>}
              </span>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${r.agentName}, ${dateLabel(r.date)}`}
                  onClick={() => void remove(r.id)}
                >
                  <Trash2Icon />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
