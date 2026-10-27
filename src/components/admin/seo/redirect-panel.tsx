"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { SelectField, TextInputField } from "@/components/admin/fields";
import { SidePanel } from "@/components/admin/side-panel";
import { Button } from "@/components/ui/button";
import { deleteRedirects, saveRedirect } from "@/features/seo/redirect-actions";
import { useAction } from "@/lib/use-action";

export type RedirectDraft = {
  id: string | null;
  fromPath: string;
  toPath: string;
  type: 301 | 302;
  isAuto?: boolean;
};

/** Add or edit one redirect (also opened from the 404 monitor with the old address filled). */
export function RedirectPanel({
  draft,
  onClose,
  onSaved,
  readOnly,
}: {
  draft: RedirectDraft | null;
  onClose: () => void;
  onSaved: () => void;
  readOnly?: boolean;
}) {
  const formId = useId();
  return (
    <SidePanel
      open={draft !== null}
      onOpenChange={(o) => !o && onClose()}
      title={draft?.id ? "Edit redirect" : "New redirect"}
      description="Visitors and search engines asking for the old address are sent to the new one."
      footer={
        !readOnly &&
        draft && (
          <div className="flex w-full items-center justify-between gap-2">
            <div>
              {draft.id && (
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" className="text-danger">
                      Delete
                    </Button>
                  }
                  title="Delete this redirect?"
                  description="The old address will show the 404 page again."
                  confirmLabel="Delete"
                  destructive
                  onConfirm={async () => {
                    const res = await deleteRedirects({ ids: [draft.id!] });
                    if (!res.ok) return toast.error(res.error);
                    toast.success("Redirect deleted");
                    onSaved();
                  }}
                />
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" form={formId}>
                Save
              </Button>
            </div>
          </div>
        )
      }
    >
      {draft && (
        <RedirectForm
          key={draft.id ?? draft.fromPath}
          formId={formId}
          draft={draft}
          onSaved={onSaved}
        />
      )}
    </SidePanel>
  );
}

function RedirectForm({
  formId,
  draft,
  onSaved,
}: {
  formId: string;
  draft: RedirectDraft;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(draft);
  const save = useAction(saveRedirect, { success: "Redirect saved", onSuccess: onSaved });
  return (
    <form
      id={formId}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save.run({
          id: value.id,
          data: { fromPath: value.fromPath, toPath: value.toPath, type: value.type },
        });
      }}
    >
      {draft.isAuto && (
        <p className="rounded-md bg-surface-muted px-3 py-2 text-[12.5px] text-text-muted">
          Added automatically when a slug changed. Saving it here makes it a manual redirect.
        </p>
      )}
      <TextInputField
        label="Old address"
        required
        value={value.fromPath}
        placeholder="/old-page"
        description="A path on this site. Old addresses with a query (?id=5) can be redirected on their own."
        onChange={(fromPath) => setValue((v) => ({ ...v, fromPath }))}
        error={save.errorFor("fromPath")}
      />
      <TextInputField
        label="New address"
        required
        value={value.toPath}
        placeholder="/new-page or https://"
        onChange={(toPath) => setValue((v) => ({ ...v, toPath }))}
        error={save.errorFor("toPath")}
      />
      <SelectField
        label="Type"
        value={String(value.type) as "301" | "302"}
        options={[
          { value: "301", label: "301 · Moved for good (search engines move the ranking)" },
          { value: "302", label: "302 · Temporary (the old address keeps its place)" },
        ]}
        onChange={(t) => setValue((v) => ({ ...v, type: t === "302" ? 302 : 301 }))}
      />
    </form>
  );
}
