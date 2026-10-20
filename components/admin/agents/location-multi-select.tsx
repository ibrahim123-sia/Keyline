"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import type { LocationNode } from "@/features/locations/queries";
import { levelLabels } from "@/features/locations/schema";

/** Locations in tree order with their depth (parents before children). */
function flatten(nodes: LocationNode[]): Array<LocationNode & { depth: number; path: string }> {
  const children = new Map<string | null, LocationNode[]>();
  for (const n of nodes) {
    const list = children.get(n.parentId) ?? [];
    list.push(n);
    children.set(n.parentId, list);
  }
  const out: Array<LocationNode & { depth: number; path: string }> = [];
  const walk = (parentId: string | null, depth: number, path: string) => {
    for (const n of (children.get(parentId) ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    )) {
      const p = path ? `${path} › ${n.name}` : n.name;
      out.push({ ...n, depth, path: p });
      walk(n.id, depth + 1, p);
    }
  };
  walk(null, 0, "");
  return out;
}

/**
 * Areas an agent covers (03; used by the "area match" lead assignment rule): a searchable
 * checklist of the locations tree, with the chosen ones shown as removable chips.
 */
export function LocationMultiSelect({
  label,
  description,
  nodes,
  value,
  onChange,
  error,
}: {
  label: string;
  description?: string;
  nodes: LocationNode[];
  value: string[];
  onChange: (ids: string[]) => void;
  error?: string;
}) {
  const labelId = useId();
  const [q, setQ] = useState("");
  const flat = useMemo(() => flatten(nodes), [nodes]);
  const byId = useMemo(() => new Map(flat.map((n) => [n.id, n])), [flat]);
  const needle = q.trim().toLowerCase();
  const shown = needle ? flat.filter((n) => n.path.toLowerCase().includes(needle)) : flat;
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...value, id] : value.filter((x) => x !== id));

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-1.5">
      <span id={labelId} className="text-[13px] font-semibold text-ink">
        {label}
      </span>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen areas">
          {value.map((id) => {
            const n = byId.get(id);
            return (
              <li
                key={id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-soft py-0.5 ps-2.5 pe-1 text-[12.5px] text-ink"
              >
                {n?.name ?? "Deleted area"}
                <button
                  type="button"
                  aria-label={`Remove ${n?.name ?? "deleted area"}`}
                  onClick={() => toggle(id, false)}
                  className="rounded-full p-0.5 text-text-muted hover:bg-surface-muted hover:text-ink"
                >
                  <XIcon className="size-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {nodes.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">
          Add locations in Setup -&gt; Locations first.
        </p>
      ) : (
        <div className="rounded-md border border-input">
          <div className="relative border-b border-border">
            <SearchIcon
              className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find an area"
              aria-label={`Find an area for ${label.toLowerCase()}`}
              className="rounded-none border-0 ps-8 shadow-none focus-visible:ring-0"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {shown.length === 0 && (
              <li className="px-3 py-2 text-[12.5px] text-text-muted">No area matches.</li>
            )}
            {shown.map((n) => (
              <li key={n.id}>
                <label
                  className="flex cursor-pointer items-center gap-2 py-1 pe-3 text-[13px] hover:bg-surface-soft"
                  style={{ paddingInlineStart: `${0.75 + (needle ? 0 : n.depth) * 1}rem` }}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-accent)]"
                    checked={value.includes(n.id)}
                    onChange={(e) => toggle(n.id, e.target.checked)}
                  />
                  <span
                    className={cn("truncate", value.includes(n.id) && "font-semibold text-ink")}
                  >
                    {needle ? n.path : n.name}
                  </span>
                  <span className="ms-auto text-[11.5px] text-text-muted">
                    {levelLabels[n.level]}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      {description && <p className="text-[12.5px] text-text-muted">{description}</p>}
      {error && (
        <p role="alert" className="text-[12.5px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
