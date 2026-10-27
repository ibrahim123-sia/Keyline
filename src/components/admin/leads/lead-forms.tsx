"use client";

import { CheckIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "cn";
import {
  CheckboxListField,
  NumberField,
  SelectField,
  SwitchField,
  TextareaField,
  TextInputField,
} from "@/components/admin/fields";
import { SidePanel } from "@/components/admin/side-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  addLeadNote,
  addLeadTask,
  completeLeadTask,
  logLeadCall,
  sendLeadEmail,
  updateLeadContact,
  updateLeadRequirements,
} from "@/features/leads/lead-actions";
import type { LeadPageData } from "@/features/leads/page-data";
import {
  callOutcomeLabels,
  callOutcomes,
  timelineOptions,
  type CallOutcome,
} from "@/features/leads/schema";
import { useAction } from "@/lib/use-action";

type Data = LeadPageData;

const toMajor = (minor: number | null | undefined, decimals: number) =>
  minor === null || minor === undefined ? null : minor / 10 ** decimals;

export function ContactPanel({
  data,
  open,
  onOpenChange,
}: {
  data: Data;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const c = data.contact;
  const [form, setForm] = useState({
    name: c.name,
    email: c.email ?? "",
    phone: c.phone ?? "",
    whatsapp: c.whatsapp ?? "",
    nationality: c.nationality ?? "",
    preferredContact: c.preferredContact,
    preferredLanguage: c.preferredLanguage ?? "",
    marketingConsent: c.marketingConsent,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const { run, pending, errorFor } = useAction(updateLeadContact, {
    success: "Contact saved",
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });
  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title="Edit contact"
      footer={
        <Button disabled={pending} onClick={() => run({ id: data.lead.id, data: form })}>
          Save contact
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <TextInputField
          label="Name"
          value={form.name}
          onChange={(v) => set("name", v)}
          error={errorFor("name")}
          required
        />
        <TextInputField
          label="Email"
          type="email"
          value={form.email}
          onChange={(v) => set("email", v)}
          error={errorFor("email")}
        />
        <TextInputField
          label="Phone"
          type="tel"
          value={form.phone}
          onChange={(v) => set("phone", v)}
          error={errorFor("phone")}
        />
        <TextInputField
          label="WhatsApp"
          type="tel"
          value={form.whatsapp}
          onChange={(v) => set("whatsapp", v)}
          error={errorFor("whatsapp")}
        />
        <SelectField
          label="Prefers"
          value={form.preferredContact ?? ""}
          onChange={(v) => set("preferredContact", v)}
          options={[
            { value: "whatsapp", label: "WhatsApp" },
            { value: "call", label: "A call" },
            { value: "email", label: "Email" },
          ]}
        />
        <TextInputField
          label="Language"
          value={form.preferredLanguage}
          onChange={(v) => set("preferredLanguage", v)}
        />
        <TextInputField
          label="Nationality"
          description="Only if they told you."
          value={form.nationality}
          onChange={(v) => set("nationality", v)}
        />
        <SwitchField
          label="Agreed to marketing"
          description="Newsletters and new matches. Changing it here is logged."
          checked={form.marketingConsent}
          onChange={(v) => set("marketingConsent", v)}
        />
      </div>
    </SidePanel>
  );
}

export function RequirementsPanel({
  data,
  open,
  onOpenChange,
}: {
  data: Data;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const r = data.lead.requirements;
  const base = data.options.baseCurrency;
  const [form, setForm] = useState({
    purpose: r.purpose ?? null,
    budgetMin: toMajor(r.budgetMin, base.decimals),
    budgetMax: toMajor(r.budgetMax, base.decimals),
    currency: r.currency ?? base.code,
    locationIds: r.locationIds ?? [],
    propertyTypeIds: r.propertyTypeIds ?? [],
    bedsMin: r.bedsMin ?? null,
    timeline: (r.timeline as (typeof timelineOptions)[number]["value"] | undefined) ?? null,
    finance: r.finance ?? null,
    moveInDate: r.moveInDate ?? null,
    notes: r.notes ?? "",
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const { run, pending, errorFor } = useAction(updateLeadRequirements, {
    success: "Requirements saved",
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });
  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      wide
      title="What they are looking for"
      footer={
        <Button disabled={pending} onClick={() => run({ id: data.lead.id, data: form })}>
          Save requirements
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <SelectField
          label="Buy or rent"
          value={form.purpose ?? ""}
          onChange={(v) => set("purpose", v)}
          options={[
            { value: "sale", label: "Buy" },
            { value: "rent", label: "Rent" },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Budget from"
            value={form.budgetMin}
            onChange={(v) => set("budgetMin", v)}
            min={0}
            suffix={form.currency}
          />
          <NumberField
            label="Budget to"
            value={form.budgetMax}
            onChange={(v) => set("budgetMax", v)}
            min={0}
            suffix={form.currency}
            error={errorFor("budgetMax")}
          />
        </div>
        <NumberField
          label="Bedrooms, at least"
          value={form.bedsMin}
          onChange={(v) => set("bedsMin", v)}
          min={0}
          max={20}
        />
        <SelectField
          label="When"
          value={form.timeline ?? ""}
          onChange={(v) => set("timeline", v)}
          options={timelineOptions.map((o) => ({ value: o.value, label: o.label }))}
        />
        <SelectField
          label="Paying with"
          value={form.finance ?? ""}
          onChange={(v) => set("finance", v)}
          options={[
            { value: "cash", label: "Cash" },
            { value: "mortgage", label: "A mortgage" },
            { value: "unknown", label: "Not sure yet" },
          ]}
        />
        <CheckboxListField
          label="Areas"
          value={form.locationIds}
          onChange={(v) => set("locationIds", v)}
          options={data.locations.map((l) => ({ value: l.id, label: l.name }))}
        />
        <CheckboxListField
          label="Property types"
          value={form.propertyTypeIds}
          onChange={(v) => set("propertyTypeIds", v)}
          options={data.propertyTypes.map((p) => ({ value: p.id, label: p.name }))}
        />
        <TextareaField
          label="Notes"
          value={form.notes}
          onChange={(v) => set("notes", v)}
          maxLength={2000}
          rows={3}
        />
      </div>
    </SidePanel>
  );
}

/** Add a note, log a call or send an email (09 §4 centre); calls and emails are the first reply. */
export function Composer({
  data,
  tab,
  onTab,
  readOnly,
}: {
  data: Data;
  tab: "note" | "call" | "email";
  onTab: (t: "note" | "call" | "email") => void;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [call, setCall] = useState<{ outcome: CallOutcome | ""; body: string }>({
    outcome: "",
    body: "",
  });
  const [mail, setMail] = useState({ subject: "", body: "" });
  const done = () => router.refresh();
  const noteAction = useAction(addLeadNote, {
    success: "Note added",
    onSuccess: () => (setNote(""), done()),
  });
  const callAction = useAction(logLeadCall, {
    success: "Call logged",
    onSuccess: () => (setCall({ outcome: "", body: "" }), done()),
  });
  const mailAction = useAction(sendLeadEmail, {
    success: "Email sent",
    onSuccess: () => (setMail({ subject: "", body: "" }), done()),
  });
  if (readOnly) return null;
  return (
    <section
      aria-label="Add to the timeline"
      className="rounded-lg border border-border bg-surface p-3"
    >
      <Tabs value={tab} onValueChange={(v) => onTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="note">Note</TabsTrigger>
          <TabsTrigger value="call">Log a call</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
        </TabsList>
        <TabsContent value="note" className="flex flex-col gap-2 pt-2">
          <TextareaField
            label="Note"
            value={note}
            onChange={setNote}
            rows={3}
            maxLength={5000}
            error={noteAction.errorFor("body")}
          />
          <Button
            className="self-end"
            disabled={noteAction.pending || !note.trim()}
            onClick={() => noteAction.run({ id: data.lead.id, body: note })}
          >
            Add note
          </Button>
        </TabsContent>
        <TabsContent value="call" className="flex flex-col gap-2 pt-2">
          <SelectField
            label="How it went"
            value={call.outcome}
            onChange={(v) => setCall((c) => ({ ...c, outcome: v }))}
            options={callOutcomes.map((o) => ({ value: o, label: callOutcomeLabels[o] }))}
          />
          <TextareaField
            label="What you talked about"
            value={call.body}
            onChange={(v) => setCall((c) => ({ ...c, body: v }))}
            rows={3}
            maxLength={5000}
          />
          <Button
            className="self-end"
            disabled={callAction.pending || !call.outcome}
            onClick={() =>
              call.outcome &&
              callAction.run({ id: data.lead.id, outcome: call.outcome, body: call.body })
            }
          >
            Log call
          </Button>
        </TabsContent>
        <TabsContent value="email" className="flex flex-col gap-2 pt-2">
          {data.contact.email ? (
            <>
              <p className="text-[12.5px] text-text-muted">
                To {data.contact.email}. Replies come to you.
              </p>
              <TextInputField
                label="Subject"
                value={mail.subject}
                onChange={(v) => setMail((m) => ({ ...m, subject: v }))}
                error={mailAction.errorFor("subject")}
              />
              <TextareaField
                label="Message"
                value={mail.body}
                onChange={(v) => setMail((m) => ({ ...m, body: v }))}
                rows={5}
                maxLength={10000}
                error={mailAction.errorFor("body")}
              />
              <Button
                className="self-end"
                disabled={mailAction.pending || !mail.subject.trim() || !mail.body.trim()}
                onClick={() => mailAction.run({ id: data.lead.id, ...mail })}
              >
                Send email
              </Button>
            </>
          ) : (
            <p className="text-[13px] text-text-muted">
              Add an email address to the contact first.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}

const dueFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function Tasks({ data, readOnly }: { data: Data; readOnly?: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const add = useAction(addLeadTask, {
    success: "Task added",
    onSuccess: () => {
      setTitle("");
      setDue("");
      router.refresh();
    },
  });
  const toggle = useAction(completeLeadTask, { onSuccess: () => router.refresh() });
  const now = new Date(data.now).getTime();
  return (
    <section aria-labelledby="lead-tasks" className="flex flex-col gap-2">
      <h2 id="lead-tasks" className="text-[13px] font-semibold text-ink">
        Tasks
      </h2>
      {data.tasks.length === 0 && <p className="text-[12.5px] text-text-muted">No tasks yet.</p>}
      <ul className="flex flex-col gap-1.5">
        {data.tasks.map((task) => (
          <li key={task.id} className="flex items-start gap-2 text-[13px]">
            <button
              type="button"
              role="checkbox"
              aria-checked={Boolean(task.doneAt)}
              aria-label={`Done: ${task.title}`}
              disabled={readOnly || toggle.pending}
              onClick={() => toggle.run({ taskId: task.id, done: !task.doneAt })}
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-input",
                task.doneAt && "border-accent bg-accent text-surface",
              )}
            >
              {task.doneAt && <CheckIcon className="size-3" aria-hidden />}
            </button>
            <div className="min-w-0">
              <p className={cn("text-ink", task.doneAt && "text-text-muted line-through")}>
                {task.title}
              </p>
              <p
                className={cn(
                  "text-[12px] text-text-muted",
                  !task.doneAt &&
                    task.dueAt &&
                    new Date(task.dueAt).getTime() < now &&
                    "font-semibold text-danger",
                )}
              >
                {task.dueAt ? dueFormat.format(new Date(task.dueAt)) : "No due date"}
                {task.agentName ? ` · ${task.agentName}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {!readOnly && (
        <form
          aria-label="Add a task"
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            void add.run({
              id: data.lead.id,
              title,
              dueAt: due ? new Date(due).toISOString() : null,
              agentId: null,
            });
          }}
        >
          <Input
            aria-label="Task"
            placeholder="New task"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-8 text-[13px]"
          />
          <div className="flex gap-1.5">
            <Input
              aria-label="Due"
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="h-8 text-[13px]"
            />
            <Button type="submit" size="sm" disabled={add.pending || !title.trim()}>
              <PlusIcon aria-hidden /> Add
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
