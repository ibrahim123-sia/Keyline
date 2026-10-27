"use client";

import { useId, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Icon, iconGroups } from "@/lib/icons";
import { AdminField } from "./fields";

/** Icon picker for master data (02 §4; 07 §1: facilities use an icon picker). */
export function IconField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  error?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  return (
    <AdminField label={label} htmlFor={id} error={error}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" className="w-fit justify-start gap-2">
            <Icon name={value} className="size-4" />
            <span className="text-[13px]">{value ?? "Choose an icon"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3" align="start">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search icons"
            aria-label="Search icons"
            className="mb-2"
          />
          <div className="max-h-72 space-y-3 overflow-y-auto">
            {Object.entries(iconGroups).map(([group, set]) => {
              const names = Object.keys(set).filter((n) => !query || n.includes(query));
              if (names.length === 0) return null;
              return (
                <div key={group}>
                  <p className="mb-1 text-[11px] font-semibold tracking-wider text-text-muted uppercase">
                    {group}
                  </p>
                  <div className="grid grid-cols-7 gap-1">
                    {names.map((n) => (
                      <button
                        key={n}
                        type="button"
                        title={n}
                        aria-label={n}
                        aria-pressed={value === n}
                        onClick={() => {
                          onChange(n);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex size-9 items-center justify-center rounded-md text-ink hover:bg-surface-muted",
                          value === n && "bg-accent-soft ring-1 ring-accent",
                        )}
                      >
                        <Icon name={n} className="size-4" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => onChange(null)}
            >
              Remove icon
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </AdminField>
  );
}
