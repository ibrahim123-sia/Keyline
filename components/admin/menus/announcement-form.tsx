"use client";

import { ArrowRightIcon } from "lucide-react";
import { useId, useState } from "react";
import { AdminField, SwitchField, TextInputField } from "@/components/admin/fields";
import { FormSection } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AnnouncementSettings } from "@/features/settings/schema";
import { saveAnnouncement } from "@/features/website/actions";
import { announcementWindow, type AnnouncementState } from "@/features/website/announcement";
import { useAction } from "@/lib/use-action";
import { isoToWallTime, wallTimeToIso } from "@/lib/zoned-time";

const stateLabels: Record<AnnouncementState, string> = {
  off: "Off",
  scheduled: "Scheduled",
  live: "Showing now",
  ended: "Ended",
};

function DateTimeField({
  label,
  value,
  timeZone,
  onChange,
  error,
}: {
  label: string;
  value: string | null;
  timeZone: string;
  onChange: (iso: string | null) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <AdminField label={label} htmlFor={id} error={error} description="Leave empty for no limit.">
      <Input
        id={id}
        type="datetime-local"
        value={isoToWallTime(value, timeZone)}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value ? wallTimeToIso(e.target.value, timeZone) : null)}
      />
    </AdminField>
  );
}

/** Website -> Menus -> Announcement bar (08 §2): text, link and an optional date range. */
export function AnnouncementForm({
  initial,
  timeZone,
  now,
  readOnly,
}: {
  initial: AnnouncementSettings;
  /** General -> Time zone: the dates are entered in agency time. */
  timeZone: string;
  /** When the page was rendered (the status line does not read the clock while rendering). */
  now: number;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const save = useAction(saveAnnouncement, {
    success: "Announcement bar saved",
    onSuccess: (saved) => {
      setValue(saved);
      setDirty(false);
    },
  });
  const set = (patch: Partial<AnnouncementSettings>) => {
    setValue((v) => ({ ...v, ...patch }));
    setDirty(true);
  };
  const { state } = announcementWindow(value, now);

  return (
    <FormSection
      title="Announcement bar"
      description={`An optional line above the header, e.g. a launch or an open house. Times are in ${timeZone}.`}
      actions={
        !readOnly && (
          <div className="flex shrink-0 items-center gap-2">
            {dirty && <span className="text-[12px] text-text-muted">Unsaved changes</span>}
            <Button
              size="sm"
              disabled={save.pending || !dirty}
              onClick={() => void save.run(value)}
            >
              {save.pending ? "Saving…" : "Save"}
            </Button>
          </div>
        )
      }
    >
      <SwitchField
        label="Show the announcement bar"
        description={`Status: ${stateLabels[state]}`}
        checked={value.enabled}
        disabled={readOnly}
        onChange={(enabled) => set({ enabled })}
      />
      <TextInputField
        label="Text"
        value={value.text}
        maxLength={160}
        placeholder="e.g. Pier Seven launches on 1 November"
        disabled={readOnly}
        onChange={(text) => set({ text })}
        error={save.errorFor("text")}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInputField
          label="Link label"
          value={value.linkLabel}
          maxLength={40}
          placeholder="e.g. See the project"
          disabled={readOnly}
          onChange={(linkLabel) => set({ linkLabel })}
          error={save.errorFor("linkLabel")}
        />
        <TextInputField
          label="Link"
          value={value.href}
          placeholder="/projects/pier-seven"
          disabled={readOnly}
          onChange={(href) => set({ href: href.trim() })}
          error={save.errorFor("href")}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <DateTimeField
          label="Show from"
          value={value.startsAt}
          timeZone={timeZone}
          onChange={(startsAt) => set({ startsAt })}
          error={save.errorFor("startsAt")}
        />
        <DateTimeField
          label="Show until"
          value={value.endsAt}
          timeZone={timeZone}
          onChange={(endsAt) => set({ endsAt })}
          error={save.errorFor("endsAt")}
        />
      </div>
      {value.text && (
        <div aria-label="Preview" className="overflow-hidden rounded-md border border-border">
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-ink px-4 py-2.5 text-center text-[14px] text-surface">
            <span>{value.text}</span>
            {value.linkLabel && (
              <span className="inline-flex items-center gap-1 font-semibold">
                {value.linkLabel}
                <ArrowRightIcon className="size-3.5" aria-hidden />
              </span>
            )}
          </p>
        </div>
      )}
    </FormSection>
  );
}
