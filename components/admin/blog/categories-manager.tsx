"use client";

import { FolderIcon, PlusIcon, TagIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { TextInputField, TextareaField } from "@/components/admin/fields";
import { FormSection } from "@/components/admin/page-header";
import { SeoFields } from "@/components/admin/seo-fields";
import { SidePanel } from "@/components/admin/side-panel";
import { SortableList } from "@/components/admin/sortable-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  deleteCategory,
  deleteTags,
  renameTag,
  reorderCategories,
  saveCategory,
} from "@/features/blog/actions";
import type { CategoryRow, TagRow } from "@/features/blog/queries";
import { emptyCategory, type CategoryInput } from "@/features/blog/schema";
import { useAction } from "@/lib/use-action";

type Editing = { id: string | null; data: CategoryInput; row: CategoryRow | null };

const postsText = (n: number) => `${n} ${n === 1 ? "post" : "posts"}`;

/** Blog -> Categories and tags (08 §3 "categories and tags management"). */
export function CategoriesManager({
  categories: initial,
  tags,
  siteName,
  readOnly,
}: {
  categories: CategoryRow[];
  tags: TagRow[];
  siteName: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const [categories, setCategories] = useState(initial);
  const [from, setFrom] = useState(initial);
  if (from !== initial) {
    setFrom(initial);
    setCategories(initial);
  }
  const [editing, setEditing] = useState<Editing | null>(null);
  const save = useAction(saveCategory, {
    success: "Category saved",
    onSuccess: () => {
      setEditing(null);
      router.refresh();
    },
  });
  const set = (patch: Partial<CategoryInput>) =>
    setEditing((e) => (e ? { ...e, data: { ...e.data, ...patch } } : e));

  async function reorder(next: CategoryRow[]) {
    const previous = categories;
    setCategories(next);
    const res = await reorderCategories({ ids: next.map((c) => c.id) });
    if (!res.ok) {
      setCategories(previous);
      toast.error(res.error);
    }
  }

  const data = editing?.data;
  return (
    <div className="flex flex-col gap-6">
      <FormSection
        title="Categories"
        description="The tabs on the Insights page, in this order. Each category has its own page."
        actions={
          !readOnly && (
            <Button
              size="sm"
              onClick={() => setEditing({ id: null, data: emptyCategory(), row: null })}
            >
              <PlusIcon /> New category
            </Button>
          )
        }
      >
        {categories.length === 0 ? (
          <EmptyState
            icon={<FolderIcon className="size-6" />}
            title="No categories yet"
            description="Group posts, for example Buying, Renting and Market news."
          />
        ) : (
          <SortableList
            items={categories}
            disabled={readOnly}
            label={(c) => `Move ${c.name}`}
            onReorder={(next) => void reorder(next)}
            renderItem={(c) => (
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-md py-1 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setEditing({ id: c.id, data: c.data, row: c })}
                aria-label={`Edit ${c.name}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{c.name}</span>
                  <span className="block truncate text-[12.5px] text-text-muted">
                    /insights/category/{c.slug}
                  </span>
                </span>
                <span className="shrink-0 text-[12.5px] text-text-muted">
                  {postsText(c.posts)}
                  {c.posts > c.published ? ` (${c.published} published)` : ""}
                </span>
              </button>
            )}
          />
        )}
      </FormSection>

      <TagsSection tags={tags} readOnly={readOnly} />

      <SidePanel
        wide
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? `Edit ${editing.row?.name ?? "category"}` : "New category"}
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
                    title={`Delete ${editing.row?.name}?`}
                    description={
                      editing.row?.posts
                        ? `Its ${postsText(editing.row.posts)} stay, without a category.`
                        : "No posts use it."
                    }
                    confirmLabel="Delete"
                    destructive
                    onConfirm={async () => {
                      const res = await deleteCategory({ id: editing.id! });
                      if (!res.ok) return toast.error(res.error);
                      toast.success("Category deleted");
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
              label="Name"
              required
              maxLength={60}
              value={data.name}
              onChange={(name) => set({ name })}
              error={save.errorFor("name")}
            />
            <TextareaField
              label="Description"
              description="Shown at the top of the category page."
              rows={3}
              maxLength={500}
              value={data.description ?? ""}
              onChange={(v) => set({ description: v || null })}
              error={save.errorFor("description")}
            />
            <SeoFields
              values={data}
              onChange={(patch) => set(patch)}
              urlPrefix="/insights/category/"
              fallbackTitle={`${data.name || "Category"} | ${siteName}`}
              fallbackDescription={data.description ?? undefined}
              siteName={siteName}
              errorFor={save.errorFor}
            />
          </form>
        )}
      </SidePanel>
    </div>
  );
}

function TagsSection({ tags, readOnly }: { tags: TagRow[]; readOnly?: boolean }) {
  const router = useRouter();
  return (
    <FormSection
      title="Tags"
      description="Added while writing posts. Renaming a tag to another tag's name merges them."
    >
      {tags.length === 0 ? (
        <EmptyState
          icon={<TagIcon className="size-6" />}
          title="No tags yet"
          description="Type tags in the post editor; they appear here."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {tags.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
              <span className="min-w-0 truncate">
                <span className="font-medium text-ink">{t.name}</span>{" "}
                <span className="text-text-muted">· {postsText(t.posts)}</span>
              </span>
              {!readOnly && (
                <span className="flex shrink-0 gap-1">
                  <RenameTag tag={t} onDone={() => router.refresh()} />
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm" className="text-danger">
                        Delete
                      </Button>
                    }
                    title={`Delete the tag ${t.name}?`}
                    description={
                      t.posts ? `${postsText(t.posts)} lose this tag.` : "No posts use it."
                    }
                    confirmLabel="Delete"
                    destructive
                    onConfirm={async () => {
                      const res = await deleteTags({ ids: [t.id] });
                      if (!res.ok) return toast.error(res.error);
                      toast.success("Tag deleted");
                      router.refresh();
                    }}
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </FormSection>
  );
}

function RenameTag({ tag, onDone }: { tag: TagRow; onDone: () => void }) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(tag.name);
  const rename = useAction(renameTag, {
    success: (d) => (d.merged ? "Tags merged" : "Tag renamed"),
    onSuccess: () => {
      setOpen(false);
      onDone();
    },
  });
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setName(tag.name);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          Rename
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-2">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void rename.run({ id: tag.id, name });
          }}
        >
          <label htmlFor={inputId} className="text-[13px] font-semibold text-ink">
            New name for {tag.name}
          </label>
          <Input
            id={inputId}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
          {rename.errorFor("name") && (
            <p className="text-[12.5px] text-danger">{rename.errorFor("name")}</p>
          )}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={rename.pending}>
              {rename.pending ? "Saving…" : "Rename"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
