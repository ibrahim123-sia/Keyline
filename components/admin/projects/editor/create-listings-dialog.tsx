"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { SelectField } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createListingsFromUnitTypes } from "@/features/projects/actions";
import type { UnitTypeInput } from "@/features/projects/schema";
import type { CreatedListing } from "@/features/projects/unit-listings";
import { useAction } from "@/lib/use-action";

/**
 * "Create listings from unit types" (07 §6): draft listings with the project's details
 * filled in. `ensureSaved` saves pending editor changes first (the drafts copy saved data).
 */
export function CreateListingsDialog({
  open,
  onOpenChange,
  projectId,
  unitTypes,
  propertyTypes,
  ensureSaved,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  unitTypes: UnitTypeInput[];
  propertyTypes: Array<{ id: string; name: string }>;
  ensureSaved: () => Promise<boolean>;
  onCreated: () => void;
}) {
  const formId = useId();
  const [propertyTypeId, setType] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [created, setCreated] = useState<CreatedListing[] | null>(null);
  const create = useAction(createListingsFromUnitTypes, {
    success: (d) =>
      `${d.created.length} draft ${d.created.length === 1 ? "listing" : "listings"} created`,
    onSuccess: (d) => {
      setCreated(d.created);
      onCreated();
    },
  });
  const items = unitTypes
    .filter((u) => chosen[u.id])
    .map((u) => ({ unitTypeId: u.id, count: counts[u.id] ?? 1 }));
  const total = items.reduce((n, i) => n + i.count, 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setCreated(null);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create listings from unit types</DialogTitle>
          <DialogDescription>
            Drafts with this project&apos;s location, pin, handover and progress, and each unit
            type&apos;s beds, size and starting price. They show the project&apos;s payment plan.
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="flex flex-col gap-2" role="region" aria-label="New drafts">
            <p className="text-[13px] text-ink">These drafts are ready to finish and publish:</p>
            <ul className="flex flex-col gap-1 text-[13px]">
              {created.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/properties/${c.id}`}
                    className="text-ink underline-offset-2 hover:underline"
                  >
                    {c.reference}: {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <form
            id={formId}
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!(await ensureSaved())) return;
              void create.run({ projectId, propertyTypeId, items });
            }}
          >
            <SelectField
              label="Property type"
              required
              value={propertyTypeId}
              onChange={setType}
              options={propertyTypes.map((t) => ({ value: t.id, label: t.name }))}
              placeholder="Choose a type"
              error={create.errorFor("propertyTypeId")}
            />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[13px] font-semibold text-ink">Unit types</legend>
              {unitTypes.map((u, i) => {
                const name = u.name || `Unit type ${i + 1}`;
                return (
                  <div key={u.id} className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-[13px] text-ink">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--color-accent)]"
                        checked={chosen[u.id] ?? false}
                        onChange={(e) => setChosen((c) => ({ ...c, [u.id]: e.target.checked }))}
                      />
                      {name}
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      className="w-20 tabular"
                      aria-label={`Drafts for ${name}`}
                      disabled={!chosen[u.id]}
                      value={counts[u.id] ?? 1}
                      onChange={(e) =>
                        setCounts((c) => ({
                          ...c,
                          [u.id]: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                        }))
                      }
                    />
                  </div>
                );
              })}
              {create.errorFor("items") && (
                <p role="alert" className="text-[12.5px] font-medium text-danger">
                  {create.errorFor("items")}
                </p>
              )}
            </fieldset>
          </form>
        )}
        <DialogFooter>
          {created ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" form={formId} disabled={create.pending || items.length === 0}>
                {create.pending
                  ? "Creating…"
                  : total
                    ? `Create ${total} ${total === 1 ? "draft" : "drafts"}`
                    : "Create drafts"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
