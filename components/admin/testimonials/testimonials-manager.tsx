"use client";

import { MessageSquareQuoteIcon, PlusIcon, StarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { ListingSinglePicker } from "@/components/admin/content/listing-picker";
import { EmptyState } from "@/components/admin/empty-state";
import { SelectField, SwitchField, TextInputField, TextareaField } from "@/components/admin/fields";
import { MediaPicker } from "@/components/admin/media/media-picker";
import { SidePanel } from "@/components/admin/side-panel";
import { SortableList } from "@/components/admin/sortable-list";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  deleteTestimonial,
  reorderTestimonials,
  saveTestimonial,
  setTestimonialPublished,
} from "@/features/testimonials/actions";
import type { TestimonialRow } from "@/features/testimonials/queries";
import { emptyTestimonial, type TestimonialInput } from "@/features/testimonials/schema";
import { useAction } from "@/lib/use-action";

type Editing = { id: string | null; data: TestimonialInput; row: TestimonialRow | null };

/** Admin -> Website -> Testimonials (08 §5): add, edit, order and publish. */
export function TestimonialsManager({
  testimonials: initial,
  readOnly,
}: {
  testimonials: TestimonialRow[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const [items, setItems] = useState(initial);
  const [from, setFrom] = useState(initial);
  if (from !== initial) {
    setFrom(initial);
    setItems(initial);
  }
  const [editing, setEditing] = useState<Editing | null>(null);
  const save = useAction(saveTestimonial, {
    success: "Testimonial saved",
    onSuccess: () => {
      setEditing(null);
      router.refresh();
    },
  });
  const set = (patch: Partial<TestimonialInput>) =>
    setEditing((e) => (e ? { ...e, data: { ...e.data, ...patch } } : e));

  async function reorder(next: TestimonialRow[]) {
    const previous = items;
    setItems(next);
    const res = await reorderTestimonials({ ids: next.map((t) => t.id) });
    if (!res.ok) {
      setItems(previous);
      toast.error(res.error);
    }
  }

  async function publish(t: TestimonialRow, published: boolean) {
    setItems((list) => list.map((x) => (x.id === t.id ? { ...x, isPublished: published } : x)));
    const res = await setTestimonialPublished({ id: t.id, published });
    if (!res.ok) {
      toast.error(res.error);
      router.refresh();
    }
  }

  const data = editing?.data;
  return (
    <div className="flex flex-col gap-3">
      {!readOnly && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing({ id: null, data: emptyTestimonial(), row: null })}>
            <PlusIcon /> New testimonial
          </Button>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState
          icon={<MessageSquareQuoteIcon className="size-6" />}
          title="No testimonials yet"
          description="Words from real clients, shown where the page builder places them."
        />
      ) : (
        <SortableList
          items={items}
          disabled={readOnly}
          label={(t) => `Move ${t.name}`}
          onReorder={(next) => void reorder(next)}
          renderItem={(t) => (
            <div className="flex items-center gap-3 py-1">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setEditing({ id: t.id, data: t.data, row: t })}
                aria-label={`Edit ${t.name}`}
              >
                <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-muted">
                  {t.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- /media resizes on its own
                    <img
                      src={`${t.photoUrl}?w=128&q=75`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <MessageSquareQuoteIcon className="size-5 text-text-muted" aria-hidden />
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block truncate font-semibold",
                      t.isPublished ? "text-ink" : "text-text-muted",
                    )}
                  >
                    {t.name}
                    {t.data.rating && (
                      <span className="ms-2 inline-flex items-center gap-0.5 text-[12.5px] font-normal text-text-muted">
                        <StarIcon className="size-3" aria-hidden /> {t.data.rating}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[12.5px] text-text-muted">
                    {t.data.quote}
                  </span>
                </span>
              </button>
              {!t.isPublished && (
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[12px] font-semibold text-text-muted">
                  Hidden
                </span>
              )}
              <Switch
                checked={t.isPublished}
                disabled={readOnly}
                onCheckedChange={(on) => void publish(t, on)}
                aria-label={`Show ${t.name} on the site`}
              />
            </div>
          )}
        />
      )}

      <SidePanel
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? `Edit ${editing.row?.name ?? "testimonial"}` : "New testimonial"}
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
                    title={`Delete the testimonial from ${editing.row?.name}?`}
                    description="It is removed from the site. This cannot be undone."
                    confirmLabel="Delete"
                    destructive
                    onConfirm={async () => {
                      const res = await deleteTestimonial({ id: editing.id! });
                      if (!res.ok) return toast.error(res.error);
                      toast.success("Testimonial deleted");
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
              maxLength={80}
              value={data.name}
              onChange={(name) => set({ name })}
              error={save.errorFor("name")}
            />
            <TextInputField
              label="Role"
              placeholder="e.g. Bought a two-bed in Dubai Marina"
              maxLength={120}
              value={data.roleText ?? ""}
              onChange={(v) => set({ roleText: v || null })}
              error={save.errorFor("roleText")}
            />
            <TextareaField
              label="Quote"
              required
              rows={5}
              maxLength={1000}
              value={data.quote}
              onChange={(quote) => set({ quote })}
              error={save.errorFor("quote")}
            />
            <SelectField
              label="Rating"
              value={data.rating ? String(data.rating) : "none"}
              onChange={(v) => set({ rating: v === "none" ? null : Number(v) })}
              options={[
                { value: "none", label: "No rating" },
                ...[5, 4, 3, 2, 1].map((n) => ({
                  value: String(n),
                  label: `${n} ${n === 1 ? "star" : "stars"}`,
                })),
              ]}
              error={save.errorFor("rating")}
            />
            <MediaPicker
              label="Photo"
              description="Only with the person's permission."
              value={data.photoId}
              onChange={(photoId) => set({ photoId })}
              error={save.errorFor("photoId")}
            />
            <ListingSinglePicker
              label="Linked home"
              description="Optional: the home they bought, sold or rented."
              value={data.propertyId}
              onChange={(propertyId) => set({ propertyId })}
              known={editing.row?.listing ?? null}
              error={save.errorFor("propertyId")}
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
