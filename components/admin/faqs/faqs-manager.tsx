"use client";

import { CircleHelpIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { SelectField, SwitchField, TextInputField } from "@/components/admin/fields";
import { FormSection } from "@/components/admin/page-header";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { SidePanel } from "@/components/admin/side-panel";
import { SortableList } from "@/components/admin/sortable-list";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { faqGroups } from "@/db/schema/content";
import { deleteFaq, reorderFaqs, saveFaq, setFaqPublished } from "@/features/faqs/actions";
import type { FaqRow } from "@/features/faqs/queries";
import { emptyFaq, faqGroupLabels, type FaqGroup, type FaqInput } from "@/features/faqs/schema";
import { useAction } from "@/lib/use-action";

type Editing = { id: string | null; data: FaqInput };

/**
 * Admin -> Website -> FAQs (08 §5): questions by group, each in its own order, with rich
 * answers. Used by pages, the AI assistant and (with their own questions) area guides.
 */
export function FaqsManager({ faqs: initial, readOnly }: { faqs: FaqRow[]; readOnly?: boolean }) {
  const router = useRouter();
  const formId = useId();
  const [items, setItems] = useState(initial);
  const [from, setFrom] = useState(initial);
  if (from !== initial) {
    setFrom(initial);
    setItems(initial);
  }
  const [editing, setEditing] = useState<Editing | null>(null);
  const save = useAction(saveFaq, {
    success: "Question saved",
    onSuccess: () => {
      setEditing(null);
      router.refresh();
    },
  });
  const set = (patch: Partial<FaqInput>) =>
    setEditing((e) => (e ? { ...e, data: { ...e.data, ...patch } } : e));

  async function reorder(group: FaqGroup, next: FaqRow[]) {
    const previous = items;
    setItems([...items.filter((f) => f.data.group !== group), ...next]);
    const res = await reorderFaqs({ group, ids: next.map((f) => f.id) });
    if (!res.ok) {
      setItems(previous);
      toast.error(res.error);
    }
  }

  async function publish(f: FaqRow, published: boolean) {
    setItems((list) => list.map((x) => (x.id === f.id ? { ...x, isPublished: published } : x)));
    const res = await setFaqPublished({ id: f.id, published });
    if (!res.ok) {
      toast.error(res.error);
      router.refresh();
    }
  }

  const data = editing?.data;
  return (
    <div className="flex flex-col gap-5">
      {items.length === 0 && (
        <EmptyState
          icon={<CircleHelpIcon className="size-6" />}
          title="No questions yet"
          description="Answer what buyers, tenants and sellers ask most. Area guides keep their own questions."
        />
      )}
      {faqGroups.map((group) => {
        const list = items.filter((f) => f.data.group === group);
        return (
          <FormSection
            key={group}
            title={faqGroupLabels[group]}
            description={`${list.length} ${list.length === 1 ? "question" : "questions"}`}
            actions={
              !readOnly && (
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`New question in ${faqGroupLabels[group]}`}
                  onClick={() => setEditing({ id: null, data: emptyFaq(group) })}
                >
                  <PlusIcon /> New question
                </Button>
              )
            }
          >
            {list.length === 0 ? (
              <p className="text-[13px] text-text-muted">No questions in this group.</p>
            ) : (
              <SortableList
                items={list}
                disabled={readOnly}
                label={(f) => `Move ${f.question}`}
                onReorder={(next) => void reorder(group, next)}
                renderItem={(f) => (
                  <div className="flex items-center gap-3 py-1">
                    <button
                      type="button"
                      className={cn(
                        "min-w-0 flex-1 truncate rounded-md text-start font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        f.isPublished ? "text-ink" : "text-text-muted",
                      )}
                      onClick={() => setEditing({ id: f.id, data: f.data })}
                      aria-label={`Edit ${f.question}`}
                    >
                      {f.question}
                    </button>
                    <Switch
                      checked={f.isPublished}
                      disabled={readOnly}
                      onCheckedChange={(on) => void publish(f, on)}
                      aria-label={`Show "${f.question}" on the site`}
                    />
                  </div>
                )}
              />
            )}
          </FormSection>
        );
      })}

      <SidePanel
        wide
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? "Edit question" : "New question"}
        footer={
          !readOnly && (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div>
                {editing?.id && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" className="text-danger">
                        Delete
                      </Button>
                    }
                    title="Delete this question?"
                    description="It is removed from the site and from the assistant's answers."
                    confirmLabel="Delete"
                    destructive
                    onConfirm={async () => {
                      const res = await deleteFaq({ id: editing.id! });
                      if (!res.ok) return toast.error(res.error);
                      toast.success("Question deleted");
                      setEditing(null);
                      router.refresh();
                    }}
                  />
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" form={formId} disabled={save.pending}>
                  {save.pending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )
        }
      >
        {editing && data && (
          <form
            id={formId}
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void save.run({ id: editing.id, data });
            }}
          >
            <TextInputField
              label="Question"
              required
              maxLength={200}
              value={data.question}
              onChange={(question) => set({ question })}
              error={save.errorFor("question")}
            />
            <RichTextEditor
              label="Answer"
              value={data.answer}
              onChange={(answer) => set({ answer })}
              error={save.errorUnder("answer")}
            />
            <SelectField
              label="Group"
              value={data.group}
              onChange={(group) => set({ group })}
              options={faqGroups.map((g) => ({ value: g, label: faqGroupLabels[g] }))}
            />
            <SwitchField
              label="Show on the site"
              checked={data.isPublished}
              onChange={(isPublished) => set({ isPublished })}
            />
          </form>
        )}
      </SidePanel>
    </div>
  );
}
