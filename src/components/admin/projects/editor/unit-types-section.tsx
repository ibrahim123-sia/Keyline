"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { NumberField, SelectField, TextInputField } from "@/components/admin/fields";
import { MediaPicker } from "@/components/admin/media/media-picker";
import { FormSection } from "@/components/admin/page-header";
import { SortableList } from "@/components/admin/sortable-list";
import { Button } from "@/components/ui/button";
import { formatFor } from "@/features/properties/format";
import type { UnitTypeInput } from "@/features/projects/schema";
import { areaInputValue, areaToSqm, areaUnitLabels } from "@/lib/units";
import { MoneyInput } from "./sections";
import type { ProjectSectionProps } from "./types";

/** A v4 UUID, also where crypto.randomUUID is missing (plain http): listings link to it. */
export function newUnitTypeId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function emptyUnitType(): UnitTypeInput {
  return {
    id: newUnitTypeId(),
    name: "",
    beds: null,
    baths: null,
    sizeMin: null,
    sizeMax: null,
    priceFrom: null,
    floorPlanId: null,
    availableCount: null,
  };
}

/** 07 §6 "unit types table (inline editable rows)": add, edit, reorder, remove. */
export function UnitTypesSection({
  data,
  set,
  errorFor,
  market,
  rememberMedia,
  readOnly,
  onCreateListings,
}: ProjectSectionProps & { onCreateListings: () => void }) {
  const currency = formatFor(data.currency, market.currencies);
  const unit = areaUnitLabels[market.areaUnit];
  const setUnit = (id: string, patch: Partial<UnitTypeInput>) =>
    set({ unitTypes: data.unitTypes.map((u) => (u.id === id ? { ...u, ...patch } : u)) });
  const units = data.unitTypes;

  return (
    <FormSection
      id="units"
      title="Unit types"
      description="Each type with its beds, sizes, starting price and how many are left."
      actions={
        !readOnly &&
        units.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={onCreateListings}>
            Create listings from unit types
          </Button>
        )
      }
    >
      {errorFor("unitTypes") && (
        <p role="alert" className="text-[12.5px] font-medium text-danger">
          {errorFor("unitTypes")}
        </p>
      )}
      {units.length === 0 ? (
        <p className="text-[13px] text-text-muted">No unit types yet.</p>
      ) : (
        <SortableList
          items={units}
          disabled={readOnly}
          label={(u) => `Move ${u.name || "unit type"}`}
          onReorder={(unitTypes) => set({ unitTypes })}
          renderItem={(u) => {
            const i = units.indexOf(u);
            const path = (f: string) => errorFor(`unitTypes.${i}.${f}`);
            return (
              <fieldset className="flex flex-col gap-3 py-2">
                <legend className="mb-2 text-[12.5px] font-semibold text-ink">
                  Unit type {i + 1}
                </legend>
                <div className="grid gap-3 sm:grid-cols-[1fr_8rem_7rem]">
                  <TextInputField
                    label="Name"
                    maxLength={80}
                    placeholder="e.g. 2 bed type B"
                    value={u.name}
                    onChange={(name) => setUnit(u.id, { name })}
                    error={path("name")}
                  />
                  <SelectField
                    label="Bedrooms"
                    value={u.beds == null ? "" : String(u.beds)}
                    onChange={(v) => setUnit(u.id, { beds: Number(v) })}
                    options={Array.from({ length: 11 }, (_, n) => ({
                      value: String(n),
                      label: n === 0 ? "Studio" : String(n),
                    }))}
                    error={path("beds")}
                  />
                  <NumberField
                    label="Bathrooms"
                    min={0}
                    max={50}
                    step={1}
                    value={u.baths}
                    onChange={(baths) => setUnit(u.id, { baths })}
                    error={path("baths")}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <NumberField
                    label="Size from"
                    suffix={unit}
                    min={0}
                    step={0.01}
                    value={areaInputValue(u.sizeMin, market.areaUnit)}
                    onChange={(v) =>
                      setUnit(u.id, { sizeMin: v == null ? null : areaToSqm(v, market.areaUnit) })
                    }
                    error={path("sizeMin")}
                  />
                  <NumberField
                    label="Size to"
                    suffix={unit}
                    min={0}
                    step={0.01}
                    value={areaInputValue(u.sizeMax, market.areaUnit)}
                    onChange={(v) =>
                      setUnit(u.id, { sizeMax: v == null ? null : areaToSqm(v, market.areaUnit) })
                    }
                    error={path("sizeMax")}
                  />
                  <MoneyInput
                    label="Price from"
                    value={u.priceFrom}
                    onChange={(priceFrom) => setUnit(u.id, { priceFrom })}
                    decimals={currency.decimals}
                    suffix={currency.code}
                    error={path("priceFrom")}
                  />
                  <NumberField
                    label="Available"
                    min={0}
                    step={1}
                    value={u.availableCount}
                    onChange={(availableCount) => setUnit(u.id, { availableCount })}
                    error={path("availableCount")}
                  />
                </div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-64 flex-1">
                    <MediaPicker
                      label={`Floor plan: ${u.name || `unit type ${i + 1}`}`}
                      value={u.floorPlanId}
                      disabled={readOnly}
                      onChange={(floorPlanId, item) => {
                        if (item) rememberMedia([item]);
                        setUnit(u.id, { floorPlanId });
                      }}
                      error={path("floorPlanId")}
                    />
                  </div>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-text-muted hover:text-danger"
                      onClick={() => set({ unitTypes: units.filter((x) => x.id !== u.id) })}
                    >
                      <Trash2Icon /> Remove {u.name || `unit type ${i + 1}`}
                    </Button>
                  )}
                </div>
              </fieldset>
            );
          }}
        />
      )}
      {!readOnly && (
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={units.length >= 100}
            onClick={() => set({ unitTypes: [...units, emptyUnitType()] })}
          >
            <PlusIcon /> Add unit type
          </Button>
        </div>
      )}
    </FormSection>
  );
}
