"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { cn } from "cn";
import { AdminField } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Node = { id: string; parentId: string | null; name: string; level: string };

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Location picker (07 §3.2 "tree autocomplete"): type to filter, shows each place's path. */
export function LocationSelect({
  label,
  nodes,
  value,
  onChange,
  error,
  required,
  disabled,
}: {
  label: string;
  nodes: Node[];
  value: string | null;
  onChange: (id: string | null) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const triggerId = useId();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const paths = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const pathOf = (n: Node) => {
      const parts: string[] = [];
      let cur: Node | undefined = n;
      for (let guard = 0; cur && guard < 10; guard++) {
        parts.unshift(cur.name);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return parts.join(" › ");
    };
    return nodes
      .map((n) => ({ id: n.id, level: n.level, path: pathOf(n), key: normalize(pathOf(n)) }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [nodes]);

  const matches = useMemo(() => {
    const words = normalize(q).split(/\s+/).filter(Boolean);
    const list = words.length ? paths.filter((p) => words.every((w) => p.key.includes(w))) : paths;
    return list.slice(0, 100);
  }, [paths, q]);

  const current = paths.find((p) => p.id === value);
  const choose = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setQ("");
  };

  return (
    <AdminField label={label} htmlFor={triggerId} error={error} required={required}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          setActive(0);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={triggerId}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-invalid={error ? true : undefined}
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", !current && "text-text-muted")}>
              {current?.path ?? "Choose a location"}
            </span>
            <ChevronsUpDownIcon className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-2">
          <Input
            autoFocus
            value={q}
            placeholder="Search locations"
            aria-label="Search locations"
            aria-controls={listId}
            aria-activedescendant={matches[active] ? `${listId}-${matches[active].id}` : undefined}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(matches.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const m = matches[active];
                if (m) choose(m.id);
              }
            }}
          />
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label={label}
            className="mt-2 max-h-64 overflow-y-auto"
          >
            {matches.length === 0 && (
              <li className="px-2 py-3 text-[13px] text-text-muted">No location matches.</li>
            )}
            {matches.map((m, i) => (
              <li
                key={m.id}
                id={`${listId}-${m.id}`}
                role="option"
                aria-selected={m.id === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(m.id)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px]",
                  i === active && "bg-surface-muted",
                )}
              >
                <span className="truncate">{m.path}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-text-muted capitalize">
                  {m.level}
                  {m.id === value && <CheckIcon className="size-3.5 text-ink" />}
                </span>
              </li>
            ))}
          </ul>
          {value && !required && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 w-full"
              onClick={() => choose(null)}
            >
              Clear
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </AdminField>
  );
}
