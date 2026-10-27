"use client";

import {
  CornerDownRightIcon,
  CornerUpLeftIcon,
  ExternalLinkIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { FormSection } from "@/components/admin/page-header";
import { TextInputField } from "@/components/admin/fields";
import { SortableList } from "@/components/admin/sortable-list";
import { Button } from "@/components/ui/button";
import { saveMenu } from "@/features/menus/actions";
import type { MenuTargetOptions } from "@/features/menus/queries";
import {
  MAX_MENU_CHILDREN,
  MAX_MENU_ITEMS,
  allowsChildren,
  menuLinkLabels,
  type MenuChildData,
  type MenuItemData,
  type MenuLocation,
} from "@/features/menus/schema";
import { useAction } from "@/lib/use-action";
import { MenuItemPanel } from "./menu-item-panel";

type Menu = { title: string; items: MenuItemData[] };
/** Which link the panel edits: a top-level link, or a dropdown link under `parentId`. */
type Editing = { parentId: string | null; item: MenuChildData; isNew: boolean };

const newLink = (): MenuChildData => ({
  id: crypto.randomUUID(),
  label: "",
  type: "page",
  target: "",
  openInNewTab: false,
});

/** What a link points at, for the row under its label. */
export function describeLink(
  item: Pick<MenuChildData, "type" | "target">,
  o: MenuTargetOptions,
): { text: string; hidden?: string; problem?: string } {
  const kind = menuLinkLabels[item.type];
  switch (item.type) {
    case "page": {
      const p = o.pages.find((x) => x.id === item.target);
      if (!p) return { text: kind, problem: "This page no longer exists" };
      return {
        text: `${kind} · ${p.title} (${p.isHome ? "/" : `/${p.slug}`})`,
        hidden: p.live ? undefined : "Hidden on the site until the page is published",
      };
    }
    case "project": {
      const p = o.projects.find((x) => x.id === item.target);
      if (!p) return { text: kind, problem: "This project no longer exists" };
      return {
        text: `${kind} · ${p.name}`,
        hidden: p.live ? undefined : "Hidden on the site until the project is published",
      };
    }
    case "area": {
      const a = o.areas.find((x) => x.id === item.target);
      return a
        ? { text: `${kind} · ${a.name}` }
        : { text: kind, problem: "This area no longer exists" };
    }
    case "category": {
      const c = o.categories.find((x) => x.id === item.target);
      return c
        ? { text: `${kind} · ${c.name}` }
        : { text: kind, problem: "This category no longer exists" };
    }
    default:
      return { text: `${kind} · ${item.target}` };
  }
}

function LinkRow({
  item,
  options,
  error,
  readOnly,
  children,
}: {
  item: MenuChildData;
  options: MenuTargetOptions;
  error?: string;
  readOnly?: boolean;
  /** Row actions. */
  children: ReactNode;
}) {
  const info = describeLink(item, options);
  return (
    <div className="flex items-center gap-2 py-0.5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[13.5px] font-semibold text-ink">
          {item.label}
          {item.openInNewTab && (
            <>
              <ExternalLinkIcon className="size-3 text-text-muted" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </>
          )}
        </p>
        <p className="truncate text-[12px] text-text-muted">{info.text}</p>
        {info.hidden && <p className="text-[12px] text-[#8A6A12]">{info.hidden}</p>}
        {(error || info.problem) && (
          <p role="alert" className="text-[12px] font-medium text-danger">
            {error ?? info.problem}
          </p>
        )}
      </div>
      {!readOnly && <div className="flex shrink-0 items-center">{children}</div>}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/**
 * One menu (08 §2): drag to reorder (keyboard: focus the handle, Space, arrows, Space),
 * header and phone menus take one level of dropdown links. Changes stay here until Save.
 */
export function MenuEditor({
  location,
  initial,
  options,
  heading,
  description,
  withTitle,
  readOnly,
}: {
  location: MenuLocation;
  initial: Menu;
  options: MenuTargetOptions;
  heading: string;
  description?: string;
  /** Footer columns have a heading. */
  withTitle?: boolean;
  readOnly?: boolean;
}) {
  const [menu, setMenu] = useState<Menu>(initial);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const nested = allowsChildren(location);
  const save = useAction(saveMenu, {
    success: `${heading} saved`,
    onSuccess: (saved) => {
      setMenu({ title: saved.title, items: saved.items });
      setDirty(false);
    },
  });

  const change = (patch: Partial<Menu>) => {
    setMenu((m) => ({ ...m, ...patch }));
    setDirty(true);
  };
  const items = menu.items;
  const setItems = (next: MenuItemData[]) => change({ items: next });
  const setChildren = (parentId: string, children: MenuChildData[]) =>
    setItems(items.map((i) => (i.id === parentId ? { ...i, children } : i)));

  /** Makes a top-level link the last dropdown link of the one above it. */
  const indent = (index: number) => {
    const above = items[index - 1];
    const item = items[index];
    if (!above || !item || item.children.length > 0) return;
    const child: MenuChildData = {
      id: item.id,
      label: item.label,
      type: item.type,
      target: item.target,
      openInNewTab: item.openInNewTab,
    };
    const next = items.filter((_, i) => i !== index);
    setItems(next.map((i) => (i.id === above.id ? { ...i, children: [...i.children, child] } : i)));
  };
  /** Moves a dropdown link out, right after its parent. */
  const outdent = (parentId: string, childId: string) => {
    const at = items.findIndex((i) => i.id === parentId);
    const parent = items[at];
    const child = parent?.children.find((c) => c.id === childId);
    if (!parent || !child) return;
    const next = [...items];
    next[at] = { ...parent, children: parent.children.filter((c) => c.id !== childId) };
    next.splice(at + 1, 0, { ...child, children: [] });
    setItems(next);
  };
  const remove = (id: string) =>
    setItems(
      items
        .filter((i) => i.id !== id)
        .map((i) => ({ ...i, children: i.children.filter((c) => c.id !== id) })),
    );
  /** Server errors for one row (not its dropdown links, which show their own). */
  const rowError = (path: string) =>
    ["target", "label", "id", "children"].map((f) => save.errorFor(`${path}.${f}`)).find(Boolean);
  const apply = (e: Editing, item: MenuChildData) => {
    if (e.parentId) {
      const parent = items.find((i) => i.id === e.parentId);
      if (!parent) return;
      setChildren(
        parent.id,
        e.isNew
          ? [...parent.children, item]
          : parent.children.map((c) => (c.id === item.id ? item : c)),
      );
    } else {
      setItems(
        e.isNew
          ? [...items, { ...item, children: [] }]
          : items.map((i) => (i.id === item.id ? { ...i, ...item } : i)),
      );
    }
    setEditing(null);
  };

  return (
    <FormSection
      title={heading}
      description={description}
      actions={
        !readOnly && (
          <div className="flex shrink-0 items-center gap-2">
            {dirty && <span className="text-[12px] text-text-muted">Unsaved changes</span>}
            <Button
              size="sm"
              disabled={save.pending || !dirty}
              onClick={() => void save.run({ location, title: menu.title, items: menu.items })}
            >
              {save.pending ? "Saving…" : "Save"}
            </Button>
          </div>
        )
      }
    >
      {withTitle && (
        <TextInputField
          label="Column heading"
          value={menu.title}
          maxLength={60}
          placeholder="e.g. Explore"
          disabled={readOnly}
          onChange={(title) => change({ title })}
          error={save.errorFor("title")}
        />
      )}
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13px] text-text-muted">
          No links yet.
        </p>
      ) : (
        <SortableList
          items={items}
          onReorder={setItems}
          disabled={readOnly}
          align="start"
          label={(i) => `Move ${i.label}`}
          renderItem={(item) => {
            const index = items.findIndex((i) => i.id === item.id);
            const above = items[index - 1];
            return (
              <div className="flex flex-col gap-1.5">
                <LinkRow
                  item={item}
                  options={options}
                  error={rowError(`items.${index}`)}
                  readOnly={readOnly}
                >
                  {nested && (
                    <IconAction
                      label={`Add a dropdown link under ${item.label}`}
                      onClick={() =>
                        setEditing({ parentId: item.id, item: newLink(), isNew: true })
                      }
                    >
                      <PlusIcon />
                    </IconAction>
                  )}
                  {nested &&
                    above &&
                    item.children.length === 0 &&
                    above.children.length < MAX_MENU_CHILDREN && (
                      <IconAction
                        label={`Move ${item.label} into the dropdown of ${above.label}`}
                        onClick={() => indent(index)}
                      >
                        <CornerDownRightIcon />
                      </IconAction>
                    )}
                  <IconAction
                    label={`Edit ${item.label}`}
                    onClick={() => setEditing({ parentId: null, item, isNew: false })}
                  >
                    <PencilIcon />
                  </IconAction>
                  <IconAction label={`Remove ${item.label}`} onClick={() => remove(item.id)}>
                    <Trash2Icon />
                  </IconAction>
                </LinkRow>
                {item.children.length > 0 && (
                  <div className="ms-1 border-s-2 border-border ps-3">
                    <SortableList
                      items={item.children}
                      onReorder={(children) => setChildren(item.id, children)}
                      disabled={readOnly}
                      label={(c) => `Move ${c.label}`}
                      renderItem={(child) => {
                        const j = item.children.findIndex((c) => c.id === child.id);
                        return (
                          <LinkRow
                            item={child}
                            options={options}
                            error={rowError(`items.${index}.children.${j}`)}
                            readOnly={readOnly}
                          >
                            <IconAction
                              label={`Move ${child.label} out of the dropdown`}
                              onClick={() => outdent(item.id, child.id)}
                            >
                              <CornerUpLeftIcon />
                            </IconAction>
                            <IconAction
                              label={`Edit ${child.label}`}
                              onClick={() =>
                                setEditing({ parentId: item.id, item: child, isNew: false })
                              }
                            >
                              <PencilIcon />
                            </IconAction>
                            <IconAction
                              label={`Remove ${child.label}`}
                              onClick={() => remove(child.id)}
                            >
                              <Trash2Icon />
                            </IconAction>
                          </LinkRow>
                        );
                      }}
                    />
                  </div>
                )}
              </div>
            );
          }}
        />
      )}
      {save.errorFor("items") && (
        <p role="alert" className="text-[12.5px] font-medium text-danger">
          {save.errorFor("items")}
        </p>
      )}
      {!readOnly && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={items.length >= MAX_MENU_ITEMS}
            onClick={() => setEditing({ parentId: null, item: newLink(), isNew: true })}
          >
            <PlusIcon /> Add link
          </Button>
        </div>
      )}
      <MenuItemPanel
        editing={editing}
        options={options}
        onCancel={() => setEditing(null)}
        onApply={(item) => editing && apply(editing, item)}
      />
    </FormSection>
  );
}
