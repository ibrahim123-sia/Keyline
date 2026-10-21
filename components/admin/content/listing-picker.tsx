"use client";

import { ArrowDownIcon, ArrowUpIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ListingOption } from "@/features/content/listing-options";
import { findListings } from "@/features/content/pickers";

/** Search box with matching listings; `onPick` gets the chosen one. */
export function ListingSearch({
  onPick,
  exclude = [],
  label = "Find a listing",
  autoFocus,
}: {
  onPick: (option: ListingOption) => void;
  exclude?: string[];
  label?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ListingOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  useEffect(() => {
    const n = ++request.current;
    const timer = setTimeout(
      async () => {
        const res = await findListings({ q, ids: [] });
        if (n !== request.current) return;
        setFailed(!res.ok);
        setResults(res.ok ? res.data : []);
      },
      q ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [q]);

  const shown = (results ?? []).filter((r) => !exclude.includes(r.id));
  return (
    <div className="rounded-md border border-input">
      <div className="relative border-b border-border">
        <SearchIcon
          className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
        <Input
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Reference or title"
          aria-label={label}
          className="rounded-none border-0 ps-8 shadow-none focus-visible:ring-0"
        />
      </div>
      <ul
        className="max-h-56 overflow-y-auto py-1"
        aria-label="Matching listings"
        aria-busy={results === null}
      >
        {results === null && (
          <li className="px-3 py-2 text-[12.5px] text-text-muted">Searching…</li>
        )}
        {failed && (
          <li className="px-3 py-2 text-[12.5px] text-danger">Could not search. Try again.</li>
        )}
        {results !== null && !failed && shown.length === 0 && (
          <li className="px-3 py-2 text-[12.5px] text-text-muted">No listing matches.</li>
        )}
        {shown.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onPick(r)}
              className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-start text-[13px] hover:bg-surface-soft focus-visible:bg-surface-soft focus-visible:outline-none"
            >
              <span className="min-w-0 truncate">{r.label}</span>
              <span
                className={cn("shrink-0 text-[12px]", r.live ? "text-success" : "text-text-muted")}
              >
                {r.status}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Several listings in order (related homes, 06 §9): chosen ones with move and remove, and a
 * search to add more. Listings that are not live are kept but not shown on the site.
 */
export function ListingMultiPicker({
  label,
  description,
  value,
  onChange,
  known,
  max = 12,
  error,
  disabled,
}: {
  label: string;
  description?: string;
  value: string[];
  onChange: (ids: string[]) => void;
  /** Names of listings already chosen (from the server). */
  known: ListingOption[];
  max?: number;
  error?: string;
  disabled?: boolean;
}) {
  const labelId = useId();
  const [names, setNames] = useState(() => new Map(known.map((o) => [o.id, o])));
  const move = (from: number, to: number) => {
    const next = [...value];
    const [id] = next.splice(from, 1);
    next.splice(to, 0, id!);
    onChange(next);
  };

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
      <span id={labelId} className="text-[13px] font-semibold text-ink">
        {label}
      </span>
      {description && <p className="text-[12.5px] text-text-muted">{description}</p>}
      {value.length > 0 && (
        <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
          {value.map((id, i) => {
            const o = names.get(id);
            return (
              <li key={id} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
                <span className="min-w-0 flex-1 truncate">{o?.label ?? "A deleted listing"}</span>
                {o && !o.live && (
                  <span className="shrink-0 text-[12px] text-text-muted">
                    {o.status}: not shown
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${o?.label ?? "listing"} up`}
                  disabled={disabled || i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${o?.label ?? "listing"} down`}
                  disabled={disabled || i === value.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${o?.label ?? "listing"}`}
                  disabled={disabled}
                  onClick={() => onChange(value.filter((x) => x !== id))}
                >
                  <XIcon />
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      {!disabled && value.length < max && (
        <ListingSearch
          label={`Add to ${label.toLowerCase()}`}
          exclude={value}
          onPick={(o) => {
            setNames((m) => new Map(m).set(o.id, o));
            onChange([...value, o.id]);
          }}
        />
      )}
      {error && (
        <p role="alert" className="text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** One listing or none (a testimonial's home). */
export function ListingSinglePicker({
  label,
  description,
  value,
  onChange,
  known,
  error,
  disabled,
}: {
  label: string;
  description?: string;
  value: string | null;
  onChange: (id: string | null) => void;
  known: ListingOption | null;
  error?: string;
  disabled?: boolean;
}) {
  const labelId = useId();
  const [chosen, setChosen] = useState<ListingOption | null>(known);
  const name = chosen && chosen.id === value ? chosen.label : value ? "A deleted listing" : null;
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
      <span id={labelId} className="text-[13px] font-semibold text-ink">
        {label}
      </span>
      {description && <p className="text-[12.5px] text-text-muted">{description}</p>}
      {value ? (
        <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-[13px]">
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            Remove
          </Button>
        </div>
      ) : (
        !disabled && (
          <ListingSearch
            label={label}
            onPick={(o) => {
              setChosen(o);
              onChange(o.id);
            }}
          />
        )
      )}
      {error && (
        <p role="alert" className="text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
