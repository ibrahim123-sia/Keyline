"use client";

import { PencilIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { NumberField, SelectField, TextInputField } from "@/components/admin/fields";
import { FormSection } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import {
  deletePriceFigure,
  listPriceFigures,
  savePriceFigure,
} from "@/features/price-trends/actions";
import type { PriceFigureRow } from "@/features/price-trends/schema";
import { useAction } from "@/lib/use-action";

export type PriceFigureOptions = {
  types: Array<{ id: string; name: string }>;
  unitLabel: string;
  currency: string;
  rentPeriod: "year" | "month";
};

type Draft = {
  id: string | null;
  month: string;
  purpose: "sale" | "rent";
  propertyTypeId: string;
  median: number | null;
  listingsCount: number | null;
  sourceNote: string;
};

const blank: Draft = {
  id: null,
  month: "",
  purpose: "sale",
  propertyTypeId: "",
  median: null,
  listingsCount: null,
  sourceNote: "",
};

const ALL = "__all";

/**
 * Price trends for a location (11 §7): the monthly agency figures (read-only, from the
 * monthly job) and the figures an admin enters with a source note. Changes are audited.
 */
export function PriceFigures({
  locationId,
  locationName,
  options,
  readOnly,
}: {
  locationId: string;
  locationName: string;
  options: PriceFigureOptions;
  readOnly?: boolean;
}) {
  const monthId = useId();
  const [rows, setRows] = useState<PriceFigureRow[] | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const load = useCallback(async () => {
    const res = await listPriceFigures({ locationId });
    if (res.ok) setRows(res.data);
    else toast.error(res.error);
  }, [locationId]);
  // The manager remounts this per location (key), so it only loads here.
  useEffect(() => {
    let live = true;
    void listPriceFigures({ locationId }).then((res) => {
      if (!live) return;
      if (res.ok) setRows(res.data);
      else toast.error(res.error);
    });
    return () => {
      live = false;
    };
  }, [locationId]);
  const save = useAction(savePriceFigure, {
    success: "Figure saved",
    onSuccess: () => {
      setDraft(blank);
      void load();
    },
  });
  const typeName = (id: string | null) =>
    id ? (options.types.find((t) => t.id === id)?.name ?? "Type") : "All types";
  const per = (purpose: "sale" | "rent") =>
    purpose === "rent"
      ? `${options.currency} per ${options.unitLabel} per ${options.rentPeriod}`
      : `${options.currency} per ${options.unitLabel}`;
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <FormSection
      title="Price trends"
      description={`Monthly median prices for ${locationName}, shown on its area page and on listing pages. Agency figures come from your listings and closed deals on the 1st of each month; add market figures with their source.`}
    >
      {rows === null ? (
        <p className="text-[13px] text-text-muted">Loading figures…</p>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-text-muted">No figures yet.</p>
      ) : (
        <div className="max-h-80 overflow-auto rounded-md border border-border">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-surface-muted text-text-muted">
              <tr>
                <th scope="col" className="px-2 py-1.5 text-start font-medium">
                  Month
                </th>
                <th scope="col" className="px-2 py-1.5 text-start font-medium">
                  For
                </th>
                <th scope="col" className="px-2 py-1.5 text-start font-medium">
                  Type
                </th>
                <th scope="col" className="px-2 py-1.5 text-end font-medium">
                  Median
                </th>
                <th scope="col" className="px-2 py-1.5 text-end font-medium">
                  Listings
                </th>
                <th scope="col" className="px-2 py-1.5 text-start font-medium">
                  Source
                </th>
                <th scope="col" className="px-2 py-1.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-2 py-1.5 tabular">{r.month}</td>
                  <td className="px-2 py-1.5">{r.purpose === "rent" ? "Rent" : "Sale"}</td>
                  <td className="px-2 py-1.5">{typeName(r.propertyTypeId)}</td>
                  <td className="px-2 py-1.5 text-end tabular">
                    {r.median.toLocaleString("en", { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-2 py-1.5 text-end tabular">{r.listingsCount || "—"}</td>
                  <td className="px-2 py-1.5">
                    {r.source === "agency_data"
                      ? `Agency data${r.dealsCount ? ` (${r.dealsCount} deals)` : ""}`
                      : r.sourceNote}
                  </td>
                  <td className="px-2 py-1.5 text-end whitespace-nowrap">
                    {!readOnly && r.source === "admin_entered" && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Edit the ${r.month} figure`}
                          onClick={() =>
                            setDraft({
                              id: r.id,
                              month: r.month,
                              purpose: r.purpose,
                              propertyTypeId: r.propertyTypeId ?? "",
                              median: r.median,
                              listingsCount: r.listingsCount || null,
                              sourceNote: r.sourceNote ?? "",
                            })
                          }
                        >
                          <PencilIcon />
                        </Button>
                        <ConfirmDialog
                          title={`Delete the ${r.month} figure?`}
                          description="It disappears from the charts. This cannot be undone."
                          confirmLabel="Delete"
                          destructive
                          onConfirm={async () => {
                            const res = await deletePriceFigure({ id: r.id });
                            if (res.ok) {
                              toast.success("Figure deleted");
                              void load();
                            } else toast.error(res.error);
                          }}
                          trigger={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Delete the ${r.month} figure`}
                            >
                              <Trash2Icon />
                            </Button>
                          }
                        />
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <p className="text-[13px] font-semibold text-ink">
            {draft.id ? `Edit the ${draft.month} figure` : "Add a market figure"}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={monthId} className="text-[13px] font-medium text-ink">
                Month
              </label>
              <input
                id={monthId}
                type="month"
                className="h-9 rounded-md border border-input bg-background px-2 text-[13px]"
                value={draft.month}
                onChange={(e) => set({ month: e.target.value })}
                aria-invalid={save.errorFor("month") ? true : undefined}
                aria-describedby={save.errorFor("month") ? `${monthId}-err` : undefined}
              />
              {save.errorFor("month") && (
                <p id={`${monthId}-err`} className="text-[12px] text-danger">
                  {save.errorFor("month")}
                </p>
              )}
            </div>
            <SelectField
              label="For"
              value={draft.purpose}
              onChange={(v) => set({ purpose: v })}
              options={[
                { value: "sale", label: "Sale" },
                { value: "rent", label: "Rent" },
              ]}
            />
            <SelectField
              label="Type"
              value={draft.propertyTypeId || ALL}
              onChange={(v) => set({ propertyTypeId: v === ALL ? "" : v })}
              error={save.errorFor("propertyTypeId")}
              options={[
                { value: ALL, label: "All types" },
                ...options.types.map((t) => ({ value: t.id, label: t.name })),
              ]}
            />
            <NumberField
              label={`Median (${per(draft.purpose)})`}
              required
              value={draft.median}
              onChange={(v) => set({ median: v })}
              min={0}
              error={save.errorFor("median")}
            />
            <NumberField
              label="Listings (optional)"
              value={draft.listingsCount}
              onChange={(v) => set({ listingsCount: v })}
              min={0}
              step={1}
              error={save.errorFor("listingsCount")}
            />
            <TextInputField
              label="Source"
              required
              description="For example the report's name and date."
              value={draft.sourceNote}
              onChange={(v) => set({ sourceNote: v })}
              maxLength={300}
              error={save.errorFor("sourceNote")}
            />
          </div>
          <div className="flex justify-end gap-2">
            {draft.id && (
              <Button type="button" variant="outline" size="sm" onClick={() => setDraft(blank)}>
                Cancel
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              disabled={save.pending}
              onClick={() =>
                void save.run({
                  id: draft.id,
                  locationId,
                  month: draft.month,
                  purpose: draft.purpose,
                  propertyTypeId: draft.propertyTypeId || null,
                  median: draft.median ?? Number.NaN,
                  listingsCount: draft.listingsCount,
                  sourceNote: draft.sourceNote,
                })
              }
            >
              {save.pending ? "Saving…" : draft.id ? "Save figure" : "Add figure"}
            </Button>
          </div>
        </div>
      )}
    </FormSection>
  );
}
