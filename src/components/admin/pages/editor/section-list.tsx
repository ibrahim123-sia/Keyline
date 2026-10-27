"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleAlertIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  ListCollapseIcon,
  ListIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { SortableList } from "@/components/admin/sortable-list";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sectionCatalog } from "@/features/cms/section-catalog";
import type { EditorSection } from "@/features/cms/section-rules";
import { isSectionType } from "@/features/cms/sections";
import { sectionIcons, sectionSummary } from "./section-meta";

/**
 * Left column of the page builder (08 §1): drag to reorder, select, hide, duplicate, delete.
 * Collapsed, each row is one line; expanded, it shows what the section says.
 */
export function SectionList({
  sections,
  selectedId,
  problems,
  readOnly,
  onSelect,
  onReorder,
  onMove,
  onDuplicate,
  onToggleHidden,
  onRemove,
  onAdd,
}: {
  sections: EditorSection[];
  selectedId: string | null;
  problems: Record<string, unknown>;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onReorder: (sections: EditorSection[]) => void;
  onMove: (id: string, by: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const label = (s: EditorSection) =>
    isSectionType(s.type) ? sectionCatalog[s.type].label : s.type;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <h2 className="text-[13px] font-semibold text-ink">
          Sections <span className="font-normal text-text-muted">({sections.length})</span>
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-pressed={collapsed}
          aria-label={collapsed ? "Show section details" : "Collapse the list"}
          title={collapsed ? "Show section details" : "Collapse the list"}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ListIcon /> : <ListCollapseIcon />}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {sections.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-[13px] text-text-muted">
            No sections yet. Add the first one.
          </p>
        ) : (
          <SortableList
            items={sections}
            onReorder={onReorder}
            disabled={readOnly}
            label={(s) => `Move ${label(s)}`}
            renderItem={(s) => {
              const Icon = isSectionType(s.type) ? sectionIcons[s.type] : CircleAlertIcon;
              const summary = sectionSummary(s);
              const index = sections.findIndex((x) => x.id === s.id);
              const selected = s.id === selectedId;
              const hasProblem = Boolean(problems[s.id]);
              return (
                <div
                  className={cn(
                    "-my-1 flex items-center gap-1 rounded-md py-1 pe-0.5",
                    selected && "bg-accent-soft",
                    s.hidden && "opacity-60",
                  )}
                >
                  <button
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    data-section-row={s.id}
                    onClick={() => onSelect(s.id)}
                    className="flex min-w-0 flex-1 items-start gap-2 rounded px-1 py-0.5 text-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                        <span className="truncate">{label(s)}</span>
                        {s.hidden && (
                          <EyeOffIcon className="size-3.5 shrink-0" aria-label="Hidden" />
                        )}
                        {hasProblem && (
                          <CircleAlertIcon
                            className="size-3.5 shrink-0 text-[#B7791F]"
                            aria-label="Not finished"
                          />
                        )}
                      </span>
                      {!collapsed && summary && (
                        <span className="block truncate text-[12px] text-text-muted">
                          {summary}
                        </span>
                      )}
                    </span>
                  </button>
                  {!readOnly && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Actions for ${label(s)}`}
                        >
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(s.id, -1)}>
                          <ArrowUpIcon /> Move up
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={index === sections.length - 1}
                          onSelect={() => onMove(s.id, 1)}
                        >
                          <ArrowDownIcon /> Move down
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onDuplicate(s.id)}>
                          <CopyIcon /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onToggleHidden(s.id)}>
                          {s.hidden ? <EyeIcon /> : <EyeOffIcon />} {s.hidden ? "Show" : "Hide"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => onRemove(s.id)}>
                          <Trash2Icon /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            }}
          />
        )}
      </div>
      {!readOnly && (
        <div className="border-t border-border p-3">
          <Button type="button" className="w-full" onClick={onAdd}>
            <PlusIcon /> Add section
          </Button>
        </div>
      )}
    </div>
  );
}
