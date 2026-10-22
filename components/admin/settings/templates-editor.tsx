"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { SwitchField, TextInputField, TextareaField } from "@/components/admin/fields";
import { actionErrorToast } from "@/components/admin/reauth-toast";
import { SidePanel } from "@/components/admin/side-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TemplateRow } from "@/features/messages/admin";
import {
  resetMessageTemplate,
  saveMessageTemplate,
  saveWhatsappMapping,
} from "@/features/messages/actions";
import { fillTemplate } from "@/features/messages/defaults";
import { sampleValues } from "@/features/messages/schema";
import { useAction } from "@/lib/use-action";

type Channel = "email" | "whatsapp";
type Draft = { subject: string; body: string; isActive: boolean };

const draftFor = (row: TemplateRow, channel: Channel): Draft | null => {
  const state = row[channel];
  if (!state) return null;
  const source = state.custom ?? { ...state.builtIn, isActive: true };
  return { subject: source.subject ?? "", body: source.body, isActive: source.isActive };
};

/** The preview with example values (a blank line starts a paragraph). */
function Preview({ subject, body }: { subject?: string; body: string }) {
  return (
    <section
      aria-label="Preview"
      className="flex flex-col gap-2 rounded-md border border-border bg-surface-soft p-4 text-[13.5px]"
    >
      <h4 className="text-[12px] font-semibold text-text-muted uppercase">Preview</h4>
      {subject !== undefined && (
        <p className="font-semibold text-ink">{fillTemplate(subject, sampleValues)}</p>
      )}
      {fillTemplate(body, sampleValues)
        .split(/\n{2,}/)
        .map((p, i) => (
          <p key={i} className="whitespace-pre-line text-text">
            {p}
          </p>
        ))}
    </section>
  );
}

function ChannelForm({
  row,
  channel,
  readOnly,
  onSaved,
}: {
  row: TemplateRow;
  channel: Channel;
  readOnly?: boolean;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFor(row, channel)!);
  const save = useAction(saveMessageTemplate, { success: "Template saved", onSuccess: onSaved });
  const state = row[channel]!;
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save.run({ key: row.key, channel, ...draft });
      }}
    >
      <SwitchField
        label="Send this message"
        description="Turned off, nothing is sent for it."
        checked={draft.isActive}
        disabled={readOnly}
        onChange={(isActive) => set({ isActive })}
      />
      {channel === "email" && (
        <TextInputField
          label="Subject"
          value={draft.subject}
          maxLength={200}
          disabled={readOnly}
          onChange={(subject) => set({ subject })}
          error={save.errorFor("subject")}
        />
      )}
      <TextareaField
        label={channel === "email" ? "Email text" : "WhatsApp text"}
        description={
          channel === "whatsapp"
            ? "Sent inside the 24-hour window. Outside it, the approved template below is sent instead."
            : "A blank line starts a new paragraph."
        }
        rows={9}
        maxLength={5000}
        value={draft.body}
        onChange={(body) => set({ body })}
        error={save.errorFor("body")}
      />
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Variables">
        <span className="text-[12.5px] text-text-muted">Insert:</span>
        {row.variables.map((v) => (
          <button
            key={v}
            type="button"
            disabled={readOnly}
            className="rounded-full border border-border px-2 py-0.5 font-mono text-[12px] text-ink hover:border-ink/40"
            onClick={() => set({ body: `${draft.body}{{${v}}}` })}
          >
            {`{{${v}}}`}
          </button>
        ))}
      </div>
      <Preview subject={channel === "email" ? draft.subject : undefined} body={draft.body} />
      {!readOnly && (
        <div className="flex flex-wrap justify-between gap-2">
          {state.custom ? (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="ghost">
                  Reset to the built-in wording
                </Button>
              }
              title="Use the built-in wording again?"
              description="Your version of this message is removed."
              confirmLabel="Reset"
              onConfirm={async () => {
                const res = await resetMessageTemplate({ key: row.key, channel });
                if (!res.ok) return toast.error(res.error);
                toast.success("Back to the built-in wording");
                setDraft(draftFor({ ...row, [channel]: { ...state, custom: null } }, channel)!);
                onSaved();
              }}
            />
          ) : (
            <span />
          )}
          <Button type="submit" disabled={save.pending}>
            {save.pending ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </form>
  );
}

function WhatsappMapping({ row, readOnly }: { row: TemplateRow; readOnly?: boolean }) {
  const router = useRouter();
  const mapping = row.whatsapp?.mapping;
  const [name, setName] = useState(mapping?.name ?? "");
  const [language, setLanguage] = useState(mapping?.language ?? "en");
  const [variables, setVariables] = useState((mapping?.variables ?? []).join(", "));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  return (
    <section
      aria-label="Approved WhatsApp template"
      className="flex flex-col gap-3 border-t border-border pt-4"
    >
      <h4 className="text-[13px] font-semibold text-ink">Approved WhatsApp template</h4>
      <p className="text-[12.5px] text-text-muted">
        Outside the 24-hour window WhatsApp only allows a template Meta has approved. Give its name
        and language, and which of this message&apos;s variables fill {"{{1}}"}, {"{{2}}"} and so
        on.
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <TextInputField
          label="Template name at Meta"
          value={name}
          disabled={readOnly}
          placeholder="lead_auto_reply"
          onChange={setName}
          error={errors.name?.[0]}
        />
        <TextInputField
          label="Language"
          value={language}
          disabled={readOnly}
          onChange={setLanguage}
          error={errors.language?.[0]}
        />
      </div>
      <TextInputField
        label="Variables in order"
        description={`From: ${row.variables.join(", ")}`}
        value={variables}
        disabled={readOnly}
        placeholder="name, agent"
        onChange={setVariables}
        error={errors.variables?.[0]}
      />
      {!readOnly && (
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await saveWhatsappMapping({
                key: row.key,
                name,
                language,
                variables: variables
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean),
              });
              setBusy(false);
              if (!res.ok) {
                setErrors(res.fieldErrors ?? {});
                return actionErrorToast(res, router);
              }
              setErrors({});
              toast.success(
                res.data.mapped ? "WhatsApp template linked" : "WhatsApp template removed",
              );
              router.refresh();
            }}
          >
            Save the WhatsApp template
          </Button>
        </div>
      )}
    </section>
  );
}

const status = (row: TemplateRow) => {
  const states = [row.email, row.whatsapp].filter(Boolean) as Array<
    NonNullable<TemplateRow["email"]>
  >;
  if (states.some((s) => s.custom && !s.custom.isActive)) return "Off";
  if (states.some((s) => s.custom)) return "Edited";
  return "Built-in";
};

/** Settings -> Message templates (13 §1): every email and WhatsApp message the system sends. */
export function TemplatesEditor({ rows, readOnly }: { rows: TemplateRow[]; readOnly?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<TemplateRow | null>(null);
  const groups = [
    { title: "To visitors and customers", rows: rows.filter((r) => r.audience === "customer") },
    { title: "To the team", rows: rows.filter((r) => r.audience === "internal") },
  ];
  const current = open ? (rows.find((r) => r.key === open.key) ?? open) : null;
  return (
    <div className="flex flex-col gap-8">
      {groups.map((g) => (
        <section key={g.title} aria-label={g.title} className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold text-ink">{g.title}</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {g.rows.map((row) => (
              <li key={row.key} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-ink">{row.label}</p>
                  <p className="text-[12px] text-text-muted">
                    {[row.email && "Email", row.whatsapp && "WhatsApp"].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={status(row) === "Off" ? "destructive" : "secondary"}>
                    {status(row)}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => setOpen(row)}>
                    {readOnly ? "View" : "Edit"}
                    <span className="sr-only"> {row.label}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <SidePanel
        wide
        open={current !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={current?.label ?? ""}
        description="Variables in {{double braces}} are filled in when the message is sent."
      >
        {current && (
          <Tabs defaultValue={current.email ? "email" : "whatsapp"}>
            <TabsList>
              {current.email && <TabsTrigger value="email">Email</TabsTrigger>}
              {current.whatsapp && <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>}
            </TabsList>
            {(["email", "whatsapp"] as const)
              .filter((c) => current[c])
              .map((c) => (
                <TabsContent key={c} value={c} className="flex flex-col gap-4 pt-4">
                  <ChannelForm
                    key={`${current.key}:${c}:${current[c]!.custom?.updatedAt ?? "built-in"}`}
                    row={current}
                    channel={c}
                    readOnly={readOnly}
                    onSaved={() => router.refresh()}
                  />
                  {c === "whatsapp" && <WhatsappMapping row={current} readOnly={readOnly} />}
                </TabsContent>
              ))}
          </Tabs>
        )}
      </SidePanel>
    </div>
  );
}
