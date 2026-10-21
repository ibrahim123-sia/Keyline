"use client";

import { SearchIcon } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sectionCatalog, sectionGroups } from "@/features/cms/section-catalog";
import { sectionTypes, type SectionType } from "@/features/cms/sections";
import { SectionThumb } from "./section-meta";

/** "+ Add section" (08 §1): every section type with a small picture of it, by group. */
export function SectionPicker({
  open,
  onOpenChange,
  onPick,
  where,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (type: SectionType) => void;
  /** "after Hero" or "at the end", for the description. */
  where: string;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const matches = (t: SectionType) =>
    !query ||
    sectionCatalog[t].label.toLowerCase().includes(query) ||
    sectionCatalog[t].description.toLowerCase().includes(query);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQ("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add a section</DialogTitle>
          <DialogDescription>It goes {where}. You can drag it elsewhere later.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sections"
            aria-label="Search sections"
            className="ps-8"
          />
        </div>
        <div className="flex flex-col gap-5">
          {sectionGroups.map((g) => {
            const types = sectionTypes.filter(
              (t) => sectionCatalog[t].group === g.key && matches(t),
            );
            if (types.length === 0) return null;
            return (
              <section key={g.key} aria-labelledby={`picker-${g.key}`}>
                <h3
                  id={`picker-${g.key}`}
                  className="mb-2 text-[12px] font-semibold tracking-wide text-text-muted uppercase"
                >
                  {g.label}
                </h3>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {types.map((t) => (
                    <li key={t}>
                      <button
                        type="button"
                        onClick={() => onPick(t)}
                        className="flex h-full w-full flex-col gap-2 rounded-lg border border-border p-2.5 text-start transition-colors hover:border-ink/40 hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <SectionThumb type={t} />
                        <span className="text-[13.5px] font-semibold text-ink">
                          {sectionCatalog[t].label}
                        </span>
                        <span className="text-[12.5px] leading-snug text-text-muted">
                          {sectionCatalog[t].description}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
