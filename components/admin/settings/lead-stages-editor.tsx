"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { ColorField, SelectField, TextInputField } from "@/components/admin/fields";
import { SortableList } from "@/components/admin/sortable-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createDefaultLeadStages,
  deleteLeadStage,
  reorderLeadStages,
  saveLeadStage,
} from "@/features/lead-stages/actions";
import type { LeadStageRow } from "@/features/lead-stages/queries";
import { kindLabels, type LeadStageInput } from "@/features/lead-stages/schema";
import { readableOn } from "@/lib/contrast";
import { describeUsage } from "@/lib/usage-registry";
import { useAction } from "@/lib/use-action";

/**
 * Pipeline stages (04 §5): order is the Kanban column order; new leads start in the first
 * open stage. Changes here save straight away.
 */
export function LeadStagesEditor({
  stages: initial,
  readOnly,
}: {
  stages: LeadStageRow[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const [stages, setStages] = useState(initial);
  const [from, setFrom] = useState(initial);
  if (from !== initial) {
    setFrom(initial);
    setStages(initial);
  }
  const [editing, setEditing] = useState<{ id: string | null; data: LeadStageInput } | null>(null);
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});
  const save = useAction(saveLeadStage, {
    success: "Stage saved",
    onSuccess: () => {
      setEditing(null);
      router.refresh();
    },
  });

  async function reorder(next: LeadStageRow[]) {
    const previous = stages;
    setStages(next);
    const res = await reorderLeadStages({ ids: next.map((s) => s.id) });
    if (!res.ok) {
      setStages(previous);
      toast.error(res.error);
    }
  }

  if (stages.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-border p-4 text-[13px]">
        <p>No pipeline stages yet. Start with a ready-made pipeline and rename it as you like.</p>
        {!readOnly && (
          <Button
            type="button"
            onClick={async () => {
              const res = await createDefaultLeadStages({});
              if (!res.ok) return toast.error(res.error);
              toast.success("Pipeline created");
              router.refresh();
            }}
          >
            Use the default stages
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SortableList
        items={stages}
        disabled={readOnly}
        label="Drag to reorder stages"
        onReorder={(next) => void reorder(next)}
        renderItem={(stage) => (
          <div className="flex items-center gap-3 py-0.5">
            <span
              className="rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold"
              style={{ backgroundColor: stage.color, color: readableOn(stage.color) }}
            >
              {stage.name}
            </span>
            <span className="text-[12.5px] text-text-muted">{kindLabels[stage.kind]}</span>
            {stage.usage.total > 0 && (
              <span className="text-[12.5px] text-text-muted">· {describeUsage(stage.usage)}</span>
            )}
            {!readOnly && (
              <div className="ms-auto flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${stage.name}`}
                  onClick={() =>
                    setEditing({
                      id: stage.id,
                      data: { name: stage.name, color: stage.color, kind: stage.kind },
                    })
                  }
                >
                  <PencilIcon />
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${stage.name}`}
                    >
                      <Trash2Icon />
                    </Button>
                  }
                  title={`Delete the ${stage.name} stage?`}
                  description={
                    stage.usage.total > 0 ? (
                      <span className="flex flex-col gap-2">
                        <span>{describeUsage(stage.usage)} are in this stage. Move them to:</span>
                        <select
                          aria-label="Move leads to"
                          className="h-8 rounded-lg border border-input bg-surface px-2 text-[13px] text-ink"
                          value={moveTo[stage.id] ?? ""}
                          onChange={(e) => setMoveTo((m) => ({ ...m, [stage.id]: e.target.value }))}
                        >
                          <option value="">Choose a stage</option>
                          {stages
                            .filter((s) => s.id !== stage.id)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      </span>
                    ) : (
                      "No leads are in this stage."
                    )
                  }
                  confirmLabel="Delete"
                  destructive
                  onConfirm={async () => {
                    const res = await deleteLeadStage({
                      id: stage.id,
                      moveTo: moveTo[stage.id] || null,
                    });
                    if (!res.ok) return toast.error(res.error);
                    toast.success("Stage deleted");
                    router.refresh();
                  }}
                />
              </div>
            )}
          </div>
        )}
      />
      {!readOnly && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            setEditing({ id: null, data: { name: "", color: "#5B6670", kind: "open" } })
          }
        >
          <PlusIcon /> Add a stage
        </Button>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit stage" : "New stage"}</DialogTitle>
            <DialogDescription>Leads in won or lost stages count as closed.</DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              id={formId}
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save.run(editing);
              }}
            >
              <TextInputField
                label="Name"
                maxLength={40}
                value={editing.data.name}
                onChange={(name) => setEditing((s) => s && { ...s, data: { ...s.data, name } })}
                error={save.errorFor("name")}
              />
              <ColorField
                label="Colour"
                value={editing.data.color}
                onChange={(color) => setEditing((s) => s && { ...s, data: { ...s.data, color } })}
                error={save.errorFor("color")}
              />
              <SelectField
                label="Kind"
                value={editing.data.kind}
                onChange={(kind) => setEditing((s) => s && { ...s, data: { ...s.data, kind } })}
                options={(["open", "won", "lost"] as const).map((k) => ({
                  value: k,
                  label: kindLabels[k],
                }))}
              />
            </form>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} disabled={save.pending}>
              {save.pending ? "Saving…" : "Save stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
