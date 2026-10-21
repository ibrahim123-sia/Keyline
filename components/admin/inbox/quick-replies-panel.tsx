"use client";

import { ArrowDownIcon, ArrowUpIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TextInputField, TextareaField } from "@/components/admin/fields";
import { SidePanel } from "@/components/admin/side-panel";
import { Button } from "@/components/ui/button";
import { deleteQuickReply, reorderQuickReplies, saveQuickReply } from "@/features/inbox/actions";
import type { QuickReply } from "@/features/inbox/queries";
import { inbox as t } from "@/lib/i18n/dictionaries/inbox";
import { useAction } from "@/lib/use-action";

/** Saved answers for the composer (09 §6): add, edit, delete and order them. */
export function QuickRepliesPanel({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: QuickReply[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string | null; title: string; body: string } | null>(
    null,
  );
  const save = useAction(saveQuickReply, {
    success: t.quickReplies.saved,
    onSuccess: () => {
      setEditing(null);
      router.refresh();
    },
  });
  const remove = useAction(deleteQuickReply, {
    success: t.quickReplies.deleted,
    onSuccess: () => router.refresh(),
  });
  const reorder = useAction(reorderQuickReplies, { onSuccess: () => router.refresh() });
  const move = (i: number, by: -1 | 1) => {
    const ids = items.map((x) => x.id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void reorder.run({ ids });
  };
  const err = (path: string) => save.fieldErrors[path]?.[0];

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={t.quickReplies.title}
      description={t.quickReplies.description}
    >
      {editing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save.run(editing);
          }}
        >
          <TextInputField
            label={t.quickReplies.name}
            value={editing.title}
            onChange={(title) => setEditing({ ...editing, title })}
            maxLength={80}
            error={err("title")}
          />
          <TextareaField
            label={t.quickReplies.body}
            value={editing.body}
            onChange={(body) => setEditing({ ...editing, body })}
            maxLength={2000}
            error={err("body")}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={save.pending}>
              Save
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <Button onClick={() => setEditing({ id: null, title: "", body: "" })}>
            {t.quickReplies.add}
          </Button>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.quickReplies.none}</p>
          ) : (
            <ul aria-label={t.quickReplies.title} className="flex flex-col divide-y divide-border">
              {items.map((q, i) => (
                <li key={q.id} className="flex items-start gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{q.title}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{q.body}</span>
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Move ${q.title} up`}
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Move ${q.title} down`}
                    onClick={() => move(i, 1)}
                    disabled={i === items.length - 1}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Edit ${q.title}`}
                    onClick={() => setEditing(q)}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Delete ${q.title}`}
                    onClick={() => remove.run({ id: q.id })}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </SidePanel>
  );
}
