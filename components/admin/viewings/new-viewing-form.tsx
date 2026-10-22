"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { SelectField, TextInputField, TextareaField } from "@/components/admin/fields";
import { SlotPicker } from "@/components/site/viewings/slot-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createViewingAction } from "@/features/viewings/admin-actions";

const NONE = "none";
const AUTO = "auto";

type Lead = { id: string; name: string; email: string | null; phone: string | null };

/**
 * The team books a viewing (09 §5): for a lead or a new person, the listing agent's free times
 * first, or any time the team chooses (a clash asks to confirm).
 */
export function NewViewingForm({
  lead,
  homes,
  projects,
  agents,
  initialPropertyId,
  initialProjectId,
}: {
  lead: Lead | null;
  homes: Array<{ id: string; label: string }>;
  projects: Array<{ id: string; label: string }>;
  agents: Array<{ id: string; name: string }>;
  initialPropertyId: string | null;
  initialProjectId: string | null;
}) {
  const router = useRouter();
  const ids = useId();
  const [contact, setContact] = useState({ name: "", phone: "", email: "" });
  const [propertyId, setPropertyId] = useState(
    initialPropertyId && homes.some((h) => h.id === initialPropertyId) ? initialPropertyId : NONE,
  );
  const [projectId, setProjectId] = useState(
    propertyId === NONE && initialProjectId && projects.some((p) => p.id === initialProjectId)
      ? initialProjectId
      : NONE,
  );
  const [agentId, setAgentId] = useState(AUTO);
  const [type, setType] = useState<"in_person" | "video">("in_person");
  const [slot, setSlot] = useState<string | null>(null);
  const [other, setOther] = useState({ date: "", time: "" });
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clash, setClash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const source =
    propertyId !== NONE
      ? `property=${propertyId}`
      : projectId !== NONE
        ? `project=${projectId}`
        : null;

  async function submit(force = false) {
    const when: { start: string } | { date: string; time: string } | null = slot
      ? { start: slot }
      : other.date && other.time
        ? { date: other.date, time: other.time }
        : null;
    if (!when) return setErrors({ when: "Pick a free time or enter another day and time" });
    setBusy(true);
    const res = await createViewingAction({
      leadId: lead?.id ?? null,
      contact: lead ? null : contact,
      propertyId: propertyId === NONE ? null : propertyId,
      projectId: projectId === NONE ? null : projectId,
      agentId: agentId === AUTO ? null : agentId,
      type,
      when,
      notes,
      force,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Viewing booked");
      const date = "start" in when ? when.start.slice(0, 10) : when.date;
      return router.push(`/admin/viewings?date=${date}`);
    }
    if (res.code === "OUTSIDE_FREE_TIMES") return setClash(res.error);
    const byField: Record<string, string> = {};
    for (const [path, messages] of Object.entries(res.fieldErrors ?? {}))
      byField[path] = messages[0]!;
    setErrors(byField);
    if (!res.fieldErrors) toast.error(res.error);
  }

  return (
    <form
      className="flex max-w-2xl flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setClash(null);
        void submit();
      }}
    >
      <section aria-label="Who is coming" className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Who is coming</h2>
        {lead ? (
          <p className="text-[14px] text-text">
            <Link
              href={`/admin/leads/${lead.id}`}
              className="font-semibold text-ink underline-offset-4 hover:underline"
            >
              {lead.name}
            </Link>
            {lead.phone && ` · ${lead.phone}`}
            {lead.email && ` · ${lead.email}`}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <TextInputField
              label="Name"
              required
              value={contact.name}
              onChange={(name) => setContact((c) => ({ ...c, name }))}
              error={errors["contact.name"]}
            />
            <TextInputField
              label="Phone"
              type="tel"
              value={contact.phone}
              onChange={(phone) => setContact((c) => ({ ...c, phone }))}
              error={errors["contact.phone"]}
            />
            <TextInputField
              label="Email"
              type="email"
              value={contact.email}
              onChange={(email) => setContact((c) => ({ ...c, email }))}
              error={errors["contact.email"]}
            />
          </div>
        )}
      </section>

      <section aria-label="What and with whom" className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Home"
          value={propertyId}
          onChange={(v) => {
            setPropertyId(v);
            if (v !== NONE) setProjectId(NONE);
            setSlot(null);
          }}
          options={[
            { value: NONE, label: "No home" },
            ...homes.map((h) => ({ value: h.id, label: h.label })),
          ]}
        />
        <SelectField
          label="Project"
          value={projectId}
          onChange={(v) => {
            setProjectId(v);
            if (v !== NONE) setPropertyId(NONE);
            setSlot(null);
          }}
          options={[
            { value: NONE, label: "No project" },
            ...projects.map((p) => ({ value: p.id, label: p.label })),
          ]}
        />
        <SelectField
          label="Agent"
          value={agentId}
          onChange={setAgentId}
          options={[
            { value: AUTO, label: "The listing's agent (or the lead's)" },
            ...agents.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink">Type</legend>
          <div className="flex gap-4 text-[14px]">
            {(["in_person", "video"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${ids}-type`}
                  checked={type === k}
                  onChange={() => setType(k)}
                />
                {k === "video" ? "Video tour" : "In person"}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section aria-label="When" className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-ink">When</h2>
        {source ? (
          <SlotPicker
            source={source}
            value={slot}
            onChange={(s) => {
              setSlot(s);
              if (s) setOther({ date: "", time: "" });
            }}
          />
        ) : (
          <p className="text-[13px] text-text-muted">Choose a home or project to see free times.</p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5" htmlFor={`${ids}-date`}>
            <span className="text-[13px] font-medium text-ink">Another day</span>
            <Input
              id={`${ids}-date`}
              type="date"
              value={other.date}
              onChange={(e) => {
                setOther((o) => ({ ...o, date: e.target.value }));
                setSlot(null);
              }}
            />
          </label>
          <label className="flex flex-col gap-1.5" htmlFor={`${ids}-time`}>
            <span className="text-[13px] font-medium text-ink">Time (agency time)</span>
            <Input
              id={`${ids}-time`}
              type="time"
              step={300}
              value={other.time}
              onChange={(e) => {
                setOther((o) => ({ ...o, time: e.target.value }));
                setSlot(null);
              }}
            />
          </label>
        </div>
        {errors.when && <p className="text-[13px] font-medium text-danger">{errors.when}</p>}
      </section>

      <TextareaField label="Notes" rows={3} maxLength={2000} value={notes} onChange={setNotes} />

      {clash ? (
        <div className="flex flex-col gap-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-[13px] text-danger">
          <p>{clash}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => void submit(true)}>
              Book anyway
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setClash(null)}>
              Pick another time
            </Button>
          </div>
        </div>
      ) : (
        <Button type="submit" className="self-start" disabled={busy}>
          {busy ? "Booking…" : "Book viewing"}
        </Button>
      )}
    </form>
  );
}
