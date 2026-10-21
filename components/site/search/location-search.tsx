"use client";

import {
  BriefcaseIcon,
  Building2Icon,
  BuildingIcon,
  ClockIcon,
  HashIcon,
  MapPinIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "cn";
import type { Suggestion } from "@/features/search/suggest";
import { format } from "@/lib/i18n";
import { search as t } from "@/lib/i18n/dictionaries/search";

const RECENT_KEY = "lintel.search.recent";
const kinds = ["location", "building", "project", "developer", "listing"] as const;
const icons = {
  location: MapPinIcon,
  building: Building2Icon,
  project: BuildingIcon,
  developer: BriefcaseIcon,
  listing: HashIcon,
} as const;

function readRecent(): Suggestion[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as Suggestion[]) : [];
    return Array.isArray(list) ? list.slice(0, 6) : [];
  } catch {
    return [];
  }
}

function saveRecent(item: Suggestion) {
  try {
    const list = readRecent().filter((r) => !(r.kind === item.kind && r.label === item.label));
    localStorage.setItem(RECENT_KEY, JSON.stringify([item, ...list].slice(0, 6)));
  } catch {
    /* private mode */
  }
}

/**
 * Location autocomplete (06 §4.3): from the 2nd character, debounced 150 ms; areas,
 * buildings and projects become `loc` filters, developers and references open their page.
 * ARIA combobox with grouped options and keyboard navigation; recent searches when empty.
 */
export function LocationSearch({
  selected,
  onAdd,
  onRemove,
  className,
}: {
  /** Chosen places: value (slug or p.<slug>) and name. */
  selected: Array<{ value: string; label: string }>;
  /** The chosen place's filter value, and its name for the chip. */
  onAdd: (value: string, label: string) => void;
  onRemove: (value: string) => void;
  className?: string;
}) {
  const router = useRouter();
  const inputId = useId();
  const listId = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [recent, setRecent] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as { items?: Suggestion[] };
        setItems(data.items ?? []);
        setActive(-1);
      } catch {
        /* aborted or offline: keep the last list */
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  // Close when focus or a click leaves the field.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const showRecent = q.trim().length < 2;
  const shown = showRecent ? recent : items;
  const grouped = useMemo(
    () =>
      showRecent
        ? [{ kind: "recent" as const, items: shown }]
        : kinds
            .map((kind) => ({ kind, items: shown.filter((s) => s.kind === kind) }))
            .filter((g) => g.items.length > 0),
    [shown, showRecent],
  );
  const flat = grouped.flatMap((g) => g.items);

  function choose(item: Suggestion) {
    saveRecent(item);
    setOpen(false);
    setQ("");
    setItems([]);
    if (item.href) router.push(item.href);
    else if (item.value && !selected.some((s) => s.value === item.value))
      onAdd(item.value, item.label);
  }

  return (
    <div ref={boxRef} className={cn("relative min-w-0", className)}>
      <label htmlFor={inputId} className="sr-only">
        {t.filters.location}
      </label>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 focus-within:border-ink/40 focus-within:ring-2 focus-within:ring-ring/30">
        <SearchIcon className="size-4 shrink-0 text-text-muted" aria-hidden />
        {selected.map((s) => (
          <span
            key={s.value}
            className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-0.5 text-[13px] text-ink"
          >
            {s.label}
            <button
              type="button"
              className="rounded-full p-0.5 hover:bg-border"
              aria-label={format(t.filters.remove, { label: s.label })}
              onClick={() => onRemove(s.value)}
            >
              <XIcon className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open && flat.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={q}
          placeholder={selected.length ? "" : t.filters.locationPlaceholder}
          className="min-w-32 flex-1 bg-transparent py-1 text-[15px] text-ink outline-none placeholder:text-text-muted"
          onFocus={() => {
            setRecent(readRecent());
            setOpen(true);
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(flat.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(-1, i - 1));
            } else if (e.key === "Enter") {
              const item = flat[active] ?? (active < 0 && !showRecent ? flat[0] : undefined);
              if (item) {
                e.preventDefault();
                choose(item);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
            } else if (e.key === "Backspace" && !q && selected.length) {
              onRemove(selected[selected.length - 1]!.value);
            }
          }}
        />
      </div>

      {open && (flat.length > 0 || (!showRecent && !loading && q.trim().length >= 2)) && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-[min(24rem,70vh)] overflow-y-auto rounded-2xl border border-border bg-surface p-2 shadow-soft">
          <ul id={listId} role="listbox" aria-label={t.suggest.label}>
            {flat.length === 0 && (
              <li role="presentation" className="px-3 py-3 text-[14px] text-text-muted">
                {format(t.suggest.noMatches, { q: q.trim() })}
              </li>
            )}
            {grouped.map((g) => (
              <li key={g.kind} role="presentation">
                <p className="px-3 pt-2 pb-1 text-[11.5px] font-semibold tracking-wide text-text-muted uppercase">
                  {g.kind === "recent" ? t.suggest.recent : t.suggest.kinds[g.kind]}
                </p>
                <ul
                  role="group"
                  aria-label={g.kind === "recent" ? t.suggest.recent : t.suggest.kinds[g.kind]}
                >
                  {g.items.map((item) => {
                    const index = flat.indexOf(item);
                    const Icon = g.kind === "recent" ? ClockIcon : icons[item.kind];
                    return (
                      <li
                        key={`${item.kind}-${item.label}-${item.value ?? item.href}`}
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={index === active}
                        onMouseEnter={() => setActive(index)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choose(item)}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[14px]",
                          index === active && "bg-surface-muted",
                        )}
                      >
                        <Icon className="size-4 shrink-0 text-text-muted" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-ink">{item.label}</span>
                        {item.detail && (
                          <span className="shrink-0 truncate text-[12.5px] text-text-muted">
                            {item.detail}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
