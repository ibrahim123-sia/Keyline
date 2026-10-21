"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * Drag-to-reorder list (dnd-kit), keyboard accessible: focus the handle, Space to lift,
 * arrows to move, Space to drop.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  disabled,
  label = "Reorder",
  align = "center",
}: {
  items: T[];
  onReorder: (items: T[]) => void;
  renderItem: (item: T) => ReactNode;
  disabled?: boolean;
  /** Accessible name of each drag handle, e.g. (item) => `Move ${item.name}`. */
  label?: string | ((item: T) => string);
  /** "start" keeps the handle at the top of tall rows (rows with nested lists). */
  align?: "center" | "start";
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {items.map((item) => (
            <SortableRow
              key={item.id}
              id={item.id}
              disabled={disabled}
              label={typeof label === "function" ? label(item) : label}
              align={align}
            >
              {renderItem(item)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  children,
  disabled,
  label,
  align,
}: {
  id: string;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  align: "center" | "start";
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex gap-2 px-2 py-1.5",
        align === "start" ? "items-start" : "items-center",
        isDragging && "relative z-10 bg-surface shadow-pin",
      )}
    >
      {!disabled && (
        <button
          type="button"
          className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded text-text-muted hover:bg-surface-muted hover:text-ink active:cursor-grabbing"
          aria-label={label}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-4" />
        </button>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
