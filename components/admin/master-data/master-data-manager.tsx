"use client";

import { GitMergeIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { SelectField } from "@/components/admin/fields";
import { SidePanel } from "@/components/admin/side-panel";
import { SortableList } from "@/components/admin/sortable-list";
import { Badge as BadgeChip } from "@/components/site/badge-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteMasterItem,
  mergeMasterItem,
  reorderMasterItems,
  saveMasterItem,
} from "@/features/master-data/actions";
import { masterLabels, type MasterKind } from "@/features/master-data/config";
import { Icon } from "@/lib/icons";
import { useAction } from "@/lib/use-action";
import { masterDefaults, masterForms, type FormValues } from "./master-forms";

export type MasterItem = {
  id: string;
  name: string;
  icon?: string | null;
  sortOrder: number;
  usage: { total: number; parts: Array<{ label: string; count: number }> };
} & Record<string, unknown>;

function meta(kind: MasterKind, item: MasterItem): string[] {
  switch (kind) {
    case "property-types":
      return [
        String(item.category),
        (item.fieldsHidden as string[]).length
          ? `hides ${(item.fieldsHidden as string[]).join(", ")}`
          : "",
      ];
    case "facilities":
      return [String(item.group)];
    case "badges":
      return item.autoRule !== "none"
        ? [
            `auto: ${String(item.autoRule).replace("_", " ")}${item.autoDays ? ` (${item.autoDays} days)` : ""}`,
          ]
        : ["manual"];
    case "poi-types":
      return [String(item.category), `${item.defaultSearchRadiusM} m`, String(item.travelMode)];
  }
}

function pick(kind: MasterKind, item: MasterItem): FormValues {
  const out: FormValues = {};
  for (const key of Object.keys(masterDefaults[kind]))
    out[key] = item[key] ?? masterDefaults[kind][key];
  return out;
}

export function MasterDataManager({
  kind,
  items: initial,
  readOnly,
}: {
  kind: MasterKind;
  items: MasterItem[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const labels = masterLabels[kind];
  const [items, setItems] = useState(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setItems(initial);
  }
  const [query, setQuery] = useState("");
  const formId = useId();
  const [editing, setEditing] = useState<{ id: string | null; values: FormValues } | null>(null);
  const [merging, setMerging] = useState<{ from: MasterItem; toId: string } | null>(null);

  const save = useAction(saveMasterItem, {
    success: editing?.id ? "Saved" : "Created",
    onSuccess: () => {
      setEditing(null);
      router.refresh();
    },
  });
  const reorder = useAction(reorderMasterItems, { onSuccess: () => router.refresh() });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  }, [items, query]);
  const Form = masterForms[kind];

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon
            className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${labels.title.toLowerCase()}`}
            aria-label={`Search ${labels.title.toLowerCase()}`}
            className="ps-8"
          />
        </div>
        {!readOnly && (
          <Button
            className="ms-auto"
            onClick={() => setEditing({ id: null, values: { ...masterDefaults[kind] } })}
          >
            <PlusIcon /> New {labels.singular}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={`No ${labels.title.toLowerCase()} yet`}
          description={labels.description}
          action={
            !readOnly && (
              <Button onClick={() => setEditing({ id: null, values: { ...masterDefaults[kind] } })}>
                <PlusIcon /> New {labels.singular}
              </Button>
            )
          }
        />
      ) : (
        <SortableList
          items={visible}
          disabled={readOnly || query.trim().length > 0}
          label={`Drag to reorder`}
          onReorder={(next) => {
            setItems(next);
            void reorder.run({ kind, ids: next.map((i) => i.id) });
          }}
          renderItem={(item) => (
            <div className="flex items-center gap-3 py-0.5">
              {kind === "badges" ? (
                <BadgeChip
                  name={item.name}
                  color={String(item.color)}
                  textColor={String(item.textColor)}
                  icon={item.icon ?? null}
                />
              ) : (
                <>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-muted text-ink">
                    <Icon name={item.icon} className="size-4" />
                  </span>
                  <span className="truncate text-[13.5px] font-semibold text-ink">{item.name}</span>
                </>
              )}
              <span className="hidden truncate text-[12.5px] text-text-muted sm:inline">
                {meta(kind, item).filter(Boolean).join(" · ")}
              </span>
              <span className="ms-auto shrink-0 text-[12.5px] text-text-muted tabular">
                {item.usage.total > 0
                  ? `Used by ${item.usage.parts.map((p) => `${p.count} ${p.label}`).join(", ")}`
                  : "Not used"}
              </span>
              {!readOnly && (
                <div className="flex shrink-0 items-center">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${item.name}`}
                    onClick={() => setEditing({ id: item.id, values: pick(kind, item) })}
                  >
                    <PencilIcon />
                  </Button>
                  {item.usage.total > 0 ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Merge ${item.name} into another ${labels.singular}`}
                      onClick={() => setMerging({ from: item, toId: "" })}
                    >
                      <GitMergeIcon />
                    </Button>
                  ) : (
                    <ConfirmDialog
                      title={`Delete ${item.name}?`}
                      description="Nothing uses it, so it can be deleted safely."
                      confirmLabel="Delete"
                      destructive
                      onConfirm={async () => {
                        const res = await deleteMasterItem({ kind, id: item.id });
                        if (res.ok) {
                          toast.success("Deleted");
                          router.refresh();
                        } else toast.error(res.error);
                      }}
                      trigger={
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${item.name}`}>
                          <Trash2Icon />
                        </Button>
                      }
                    />
                  )}
                </div>
              )}
            </div>
          )}
        />
      )}

      <SidePanel
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing?.id ? `Edit ${labels.singular}` : `New ${labels.singular}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} disabled={save.pending}>
              {save.pending ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        {editing && (
          <form
            id={formId}
            onSubmit={(e) => {
              e.preventDefault();
              void save.run({ kind, id: editing.id, data: editing.values });
            }}
            className="flex flex-col gap-4"
          >
            <Form
              values={editing.values}
              set={(key, value) =>
                setEditing((s) => (s ? { ...s, values: { ...s.values, [key]: value } } : s))
              }
              errorFor={save.errorFor}
            />
          </form>
        )}
      </SidePanel>

      <SidePanel
        open={merging !== null}
        onOpenChange={(open) => !open && setMerging(null)}
        title={merging ? `Merge "${merging.from.name}"` : "Merge"}
        description={
          merging
            ? `Everything that uses "${merging.from.name}" (${merging.from.usage.parts
                .map((p) => `${p.count} ${p.label}`)
                .join(", ")}) moves to the item you choose. "${merging.from.name}" is then deleted.`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMerging(null)}>
              Cancel
            </Button>
            <Button
              disabled={!merging?.toId}
              onClick={async () => {
                if (!merging?.toId) return;
                const res = await mergeMasterItem({
                  kind,
                  fromId: merging.from.id,
                  toId: merging.toId,
                });
                if (res.ok) {
                  toast.success(`Merged. ${res.data.moved} references moved.`);
                  setMerging(null);
                  router.refresh();
                } else toast.error(res.error);
              }}
            >
              Merge and delete
            </Button>
          </div>
        }
      >
        {merging && (
          <SelectField
            label="Merge into"
            value={merging.toId}
            onChange={(v) => setMerging((m) => (m ? { ...m, toId: v } : m))}
            options={items
              .filter((i) => i.id !== merging.from.id)
              .map((i) => ({ value: i.id, label: i.name }))}
          />
        )}
      </SidePanel>
    </div>
  );
}
