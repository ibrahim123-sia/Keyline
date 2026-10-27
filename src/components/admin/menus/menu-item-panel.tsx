"use client";

import { useId, useState } from "react";
import { SelectField, SwitchField, TextInputField } from "@/components/admin/fields";
import { LocationSelect } from "@/components/admin/properties/editor/location-select";
import { SidePanel } from "@/components/admin/side-panel";
import { Button } from "@/components/ui/button";
import type { MenuTargetOptions } from "@/features/menus/queries";
import {
  menuChildSchema,
  menuLinkLabels,
  menuLinkTypes,
  type MenuChildData,
  type MenuLinkType,
} from "@/features/menus/schema";

type Editing = { parentId: string | null; item: MenuChildData; isNew: boolean };

/** Side panel for one menu link: label, what it points at, new tab. */
export function MenuItemPanel({
  editing,
  options,
  onCancel,
  onApply,
}: {
  editing: Editing | null;
  options: MenuTargetOptions;
  onCancel: () => void;
  onApply: (item: MenuChildData) => void;
}) {
  const formId = useId();
  return (
    <SidePanel
      open={editing !== null}
      onOpenChange={(o) => !o && onCancel()}
      title={
        editing?.isNew
          ? editing.parentId
            ? "New dropdown link"
            : "New link"
          : `Edit ${editing?.item.label || "link"}`
      }
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" form={formId}>
            {editing?.isNew ? "Add" : "Done"}
          </Button>
        </div>
      }
    >
      {editing && (
        // Keyed by link, so the draft starts fresh each time the panel opens.
        <LinkForm
          key={editing.item.id}
          formId={formId}
          initial={editing.item}
          options={options}
          onApply={onApply}
        />
      )}
    </SidePanel>
  );
}

function LinkForm({
  formId,
  initial,
  options,
  onApply,
}: {
  formId: string;
  initial: MenuChildData;
  options: MenuTargetOptions;
  onApply: (item: MenuChildData) => void;
}) {
  const [draft, setDraft] = useState<MenuChildData>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<MenuChildData>) => setDraft((d) => ({ ...d, ...patch }));

  /** Picking a page, area, project or category fills an empty label with its name. */
  const pick = (target: string, name: string | undefined) =>
    set({ target, ...(draft.label.trim() === "" && name ? { label: name } : {}) });

  const changeType = (type: MenuLinkType) => {
    // Typed addresses survive switching between "web address" and "search preset".
    const typed = (t: MenuLinkType) => t === "url" || t === "search";
    set({ type, target: typed(type) && typed(draft.type) ? draft.target : "" });
  };

  const submit = () => {
    const res = menuChildSchema.safeParse(draft);
    if (!res.success) {
      const next: Record<string, string> = {};
      for (const issue of res.error.issues) {
        const key = String(issue.path[0] ?? "label");
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    onApply(res.data);
  };

  const target = (() => {
    switch (draft.type) {
      case "page":
        return (
          <SelectField
            label="Page"
            required
            value={draft.target}
            placeholder={options.pages.length ? "Choose a page" : "No pages yet"}
            options={options.pages.map((p) => ({
              value: p.id,
              label: `${p.title}${p.live ? "" : " (not published)"}`,
            }))}
            onChange={(id) => pick(id, options.pages.find((p) => p.id === id)?.title)}
            error={errors.target}
          />
        );
      case "project":
        return (
          <SelectField
            label="Project"
            required
            value={draft.target}
            placeholder={options.projects.length ? "Choose a project" : "No projects yet"}
            options={options.projects.map((p) => ({
              value: p.id,
              label: `${p.name}${p.live ? "" : " (not published)"}`,
            }))}
            onChange={(id) => pick(id, options.projects.find((p) => p.id === id)?.name)}
            error={errors.target}
          />
        );
      case "category":
        return (
          <SelectField
            label="Blog category"
            required
            value={draft.target}
            placeholder={options.categories.length ? "Choose a category" : "No categories yet"}
            options={options.categories.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(id) => pick(id, options.categories.find((c) => c.id === id)?.name)}
            error={errors.target}
          />
        );
      case "area":
        return (
          <div className="flex flex-col gap-1.5">
            <LocationSelect
              label="Area"
              required
              nodes={options.areas}
              value={draft.target || null}
              onChange={(id) => pick(id ?? "", options.areas.find((a) => a.id === id)?.name)}
              error={errors.target}
            />
            <p className="text-[12.5px] text-text-muted">
              Opens the area guide when one is published, otherwise the homes for sale there.
            </p>
          </div>
        );
      case "search":
        return (
          <TextInputField
            label="Search address"
            required
            value={draft.target}
            placeholder="/rent/old-harbour?beds=2"
            description="Run the search on the site, then copy the address from the browser, starting at /buy, /rent or /off-plan."
            onChange={(v) => set({ target: v.trim() })}
            error={errors.target}
          />
        );
      default:
        return (
          <TextInputField
            label="Address"
            required
            value={draft.target}
            placeholder="/about or https://"
            description="A path on this site, a full https:// address, mailto: or tel:."
            onChange={(v) => set({ target: v.trim() })}
            error={errors.target}
          />
        );
    }
  })();

  return (
    <form
      id={formId}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <TextInputField
        label="Label"
        required
        value={draft.label}
        maxLength={60}
        onChange={(label) => set({ label })}
        error={errors.label}
      />
      <SelectField
        label="Links to"
        value={draft.type}
        options={menuLinkTypes.map((t) => ({ value: t, label: menuLinkLabels[t] }))}
        onChange={changeType}
      />
      {target}
      <SwitchField
        label="Open in a new tab"
        description="For links to other websites."
        checked={draft.openInNewTab}
        onChange={(openInNewTab) => set({ openInNewTab })}
      />
    </form>
  );
}
