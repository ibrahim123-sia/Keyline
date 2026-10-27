"use client";

import { ArrowDownIcon, ArrowUpIcon, CheckIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { cn } from "cn";
import { AdminField, TextInputField } from "@/components/admin/fields";
import { MediaPicker } from "@/components/admin/media/media-picker";
import { MediaThumb } from "@/components/admin/media/media-thumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { findListingOptions } from "@/features/cms/page-actions";
import type { ListingOption } from "@/features/cms/page-schema";
import type { MediaItem } from "@/features/media/queries";

/** Small editors shared by the section settings forms (08 §1 section fields). */

export type Btn = { label: string; href: string };

const move = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
};

function RowTools({
  index,
  count,
  onMove,
  onRemove,
  label,
}: {
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Move ${label} up`}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Move ${label} down`}
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
      >
        <ArrowDownIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </div>
  );
}

/** Up to `max` buttons: label and link (a path like /buy or a full https link). */
export function ButtonsField({
  label = "Buttons",
  value,
  onChange,
  max = 2,
  errorFor,
  path,
}: {
  label?: string;
  value: Btn[] | undefined;
  onChange: (v: Btn[]) => void;
  max?: number;
  errorFor: (field: string) => string | undefined;
  /** Field path of the list, e.g. "props.buttons". */
  path: string;
}) {
  const list = value ?? [];
  return (
    <AdminField label={label} description={`Up to ${max}. The first one stands out.`}>
      <div className="flex flex-col gap-2">
        {list.map((b, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg border border-border p-2">
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
              <TextInputField
                label="Label"
                value={b.label}
                maxLength={40}
                onChange={(v) => onChange(list.map((x, j) => (j === i ? { ...x, label: v } : x)))}
                error={errorFor(`${path}.${i}.label`)}
              />
              <TextInputField
                label="Link"
                value={b.href}
                placeholder="/contact"
                onChange={(v) => onChange(list.map((x, j) => (j === i ? { ...x, href: v } : x)))}
                error={errorFor(`${path}.${i}.href`)}
              />
            </div>
            <RowTools
              index={i}
              count={list.length}
              label={`button ${i + 1}`}
              onMove={(to) => onChange(move(list, i, to))}
              onRemove={() => onChange(list.filter((_, j) => j !== i))}
            />
          </div>
        ))}
        {list.length < max && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => onChange([...list, { label: "", href: "" }])}
          >
            <PlusIcon /> Add a button
          </Button>
        )}
      </div>
    </AdminField>
  );
}

/** A list of small items (promise points, stats) edited in place. */
export function ItemsField<T extends Record<string, unknown>>({
  label,
  value,
  onChange,
  min,
  max,
  blank,
  noun,
  render,
}: {
  label: string;
  value: T[] | undefined;
  onChange: (v: T[]) => void;
  min: number;
  max: number;
  blank: () => T;
  noun: string;
  render: (item: T, set: (patch: Partial<T>) => void, index: number) => ReactNode;
}) {
  const list = value ?? [];
  return (
    <AdminField label={label} description={min === max ? undefined : `${min} to ${max} ${noun}s.`}>
      <ol className="flex flex-col gap-2">
        {list.map((item, i) => (
          <li key={i} className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-text-muted">
                {noun[0]!.toUpperCase() + noun.slice(1)} {i + 1}
              </span>
              <RowTools
                index={i}
                count={list.length}
                label={`${noun} ${i + 1}`}
                onMove={(to) => onChange(move(list, i, to))}
                onRemove={() => list.length > min && onChange(list.filter((_, j) => j !== i))}
              />
            </div>
            <div className="flex flex-col gap-3">
              {render(
                item,
                (patch) => onChange(list.map((x, j) => (j === i ? { ...x, ...patch } : x))),
                i,
              )}
            </div>
          </li>
        ))}
      </ol>
      {list.length < max && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => onChange([...list, blank()])}
        >
          <PlusIcon /> Add a {noun}
        </Button>
      )}
    </AdminField>
  );
}

export type PickOption = { id: string; name: string; detail?: string };

/** Choose several records in order (agents, developers, projects, testimonials...). */
export function OptionPicker({
  label,
  description,
  value,
  onChange,
  options,
  max,
  error,
  empty,
}: {
  label: string;
  description?: string;
  value: string[] | undefined;
  onChange: (ids: string[]) => void;
  options: PickOption[];
  max: number;
  error?: string;
  /** Shown when there is nothing to pick yet (where to add them). */
  empty?: ReactNode;
}) {
  const ids = value ?? [];
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  return (
    <AdminField label={label} description={description} error={error}>
      <ChosenList
        ids={ids}
        labelFor={(id) => byId.get(id)?.name ?? "Removed (save to drop it)"}
        detailFor={(id) => byId.get(id)?.detail}
        onChange={onChange}
      />
      {options.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">{empty ?? "Nothing to choose from yet."}</p>
      ) : (
        ids.length < max && (
          <AddCombobox
            options={options.filter((o) => !ids.includes(o.id))}
            onPick={(id) => onChange([...ids, id])}
          />
        )
      )}
    </AdminField>
  );
}

function ChosenList({
  ids,
  labelFor,
  detailFor,
  onChange,
}: {
  ids: string[];
  labelFor: (id: string) => string;
  detailFor: (id: string) => string | undefined;
  onChange: (ids: string[]) => void;
}) {
  if (ids.length === 0) return null;
  return (
    <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {ids.map((id, i) => (
        <li key={id} className="flex items-center gap-2 px-2.5 py-1.5">
          <span className="w-5 shrink-0 text-[12px] text-text-muted tabular">{i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] text-ink">{labelFor(id)}</span>
            {detailFor(id) && (
              <span className="block truncate text-[12px] text-text-muted">{detailFor(id)}</span>
            )}
          </span>
          <RowTools
            index={i}
            count={ids.length}
            label={labelFor(id)}
            onMove={(to) => onChange(move(ids, i, to))}
            onRemove={() => onChange(ids.filter((x) => x !== id))}
          />
        </li>
      ))}
    </ol>
  );
}

function AddCombobox({
  options,
  onPick,
  onSearch,
  placeholder = "Search",
}: {
  options: PickOption[];
  onPick: (id: string, option: PickOption) => void;
  /** Async search: called as the admin types; `options` then holds the results. */
  onSearch?: (q: string) => void;
  placeholder?: string;
}) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = onSearch
    ? options
    : options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 50);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="w-fit">
          <PlusIcon /> Add
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <label htmlFor={inputId} className="sr-only">
          {placeholder}
        </label>
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <Input
            id={inputId}
            autoFocus
            value={q}
            placeholder={placeholder}
            className="ps-8"
            onChange={(e) => {
              setQ(e.target.value);
              onSearch?.(e.target.value);
            }}
          />
        </div>
        <ul className="mt-2 max-h-64 overflow-y-auto" role="listbox" aria-label={placeholder}>
          {shown.length === 0 && (
            <li className="px-2 py-3 text-[13px] text-text-muted">No matches.</li>
          )}
          {shown.map((o) => (
            <li key={o.id} role="option" aria-selected={false}>
              <button
                type="button"
                className="flex w-full flex-col rounded-md px-2 py-1.5 text-start hover:bg-muted"
                onClick={() => {
                  onPick(o.id, o);
                  setOpen(false);
                  setQ("");
                }}
              >
                <span className="truncate text-[13px] text-ink">{o.name}</span>
                {o.detail && (
                  <span className="truncate text-[12px] text-text-muted">{o.detail}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Pick listings by reference or title (searched on the server: there can be thousands). */
export function ListingPicker({
  label,
  value,
  onChange,
  max,
  error,
}: {
  label: string;
  value: string[] | undefined;
  onChange: (ids: string[]) => void;
  max: number;
  error?: string;
}) {
  const ids = useMemo(() => value ?? [], [value]);
  const [known, setKnown] = useState<Record<string, ListingOption>>({});
  const [results, setResults] = useState<ListingOption[]>([]);
  const idsKey = ids.join(",");

  useEffect(() => {
    const missing = idsKey.split(",").filter((id) => id && !known[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void findListingOptions({ q: "", ids: missing }).then((res) => {
      if (!cancelled && res.ok)
        setKnown((k) => ({ ...k, ...Object.fromEntries(res.data.map((o) => [o.id, o])) }));
    });
    return () => {
      cancelled = true;
    };
  }, [idsKey, known]);

  useEffect(() => {
    void findListingOptions({ q: "", ids: [] }).then((res) => res.ok && setResults(res.data));
  }, []);

  const search = useDebounced((q: string) => {
    void findListingOptions({ q, ids: [] }).then((res) => res.ok && setResults(res.data));
  }, 250);

  return (
    <AdminField label={label} description={`Up to ${max}, in this order.`} error={error}>
      <ChosenList
        ids={ids}
        labelFor={(id) => known[id]?.label ?? "Loading…"}
        detailFor={(id) => known[id]?.detail}
        onChange={onChange}
      />
      {ids.length < max && (
        <AddCombobox
          placeholder="Reference or title"
          options={results
            .filter((r) => !ids.includes(r.id))
            .map((r) => ({ id: r.id, name: r.label, detail: r.detail }))}
          onSearch={search}
          onPick={(id) => {
            const o = results.find((r) => r.id === id);
            if (o) setKnown((k) => ({ ...k, [id]: o }));
            onChange([...ids, id]);
          }}
        />
      )}
    </AdminField>
  );
}

function useDebounced<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  return (...args: A) => {
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => fn(...args), ms));
  };
}

export type GalleryImage = { mediaId: string; caption: string; alt: string };

/** Gallery images: add from the library, reorder, caption and alt text for each. */
export function GalleryField({
  value,
  onChange,
  media,
  rememberMedia,
  error,
}: {
  value: GalleryImage[] | undefined;
  onChange: (v: GalleryImage[]) => void;
  media: Record<string, MediaItem>;
  rememberMedia: (item: MediaItem) => void;
  error?: string;
}) {
  const list = value ?? [];
  return (
    <div className="flex flex-col gap-3">
      <AdminField
        label="Images"
        description="Up to 40. Alt text describes each image for screen readers."
        error={error}
      >
        <ol className="flex flex-col gap-2">
          {list.map((img, i) => {
            const item = media[img.mediaId];
            return (
              <li
                key={`${img.mediaId}-${i}`}
                className="flex gap-3 rounded-lg border border-border p-2"
              >
                {item ? (
                  <MediaThumb
                    item={item}
                    width={128}
                    className="size-16 shrink-0 rounded-md border border-border"
                  />
                ) : (
                  <div className="size-16 shrink-0 rounded-md bg-surface-muted" />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <TextInputField
                    label="Alt text"
                    value={img.alt}
                    maxLength={200}
                    placeholder={item?.alt || "What the image shows"}
                    onChange={(v) => onChange(list.map((x, j) => (j === i ? { ...x, alt: v } : x)))}
                  />
                  <TextInputField
                    label="Caption"
                    value={img.caption}
                    maxLength={200}
                    onChange={(v) =>
                      onChange(list.map((x, j) => (j === i ? { ...x, caption: v } : x)))
                    }
                  />
                </div>
                <RowTools
                  index={i}
                  count={list.length}
                  label={`image ${i + 1}`}
                  onMove={(to) => onChange(move(list, i, to))}
                  onRemove={() => onChange(list.filter((_, j) => j !== i))}
                />
              </li>
            );
          })}
        </ol>
      </AdminField>
      {list.length < 40 && (
        <MediaPicker
          label="Add an image"
          value={null}
          onChange={(id, item) => {
            if (!id) return;
            if (item) rememberMedia(item);
            onChange([...list, { mediaId: id, caption: "", alt: "" }]);
          }}
        />
      )}
    </div>
  );
}

/** Radio buttons for a short list of choices (source, layout, side). */
export function ChoiceField<T extends string>({
  label,
  value,
  onChange,
  options,
  description,
}: {
  label: string;
  value: T | undefined;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  description?: string;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[13px] font-semibold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              value === o.value
                ? "border-ink bg-ink text-surface"
                : "border-border text-ink hover:border-ink/40",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {value === o.value && <CheckIcon className="size-3.5" aria-hidden />}
            {o.label}
          </label>
        ))}
      </div>
      {description && <p className="text-[12.5px] text-text-muted">{description}</p>}
    </fieldset>
  );
}
