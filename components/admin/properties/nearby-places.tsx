"use client";

import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { SortableList } from "@/components/admin/sortable-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  recalculatePropertyPois,
  reorderPropertyPois,
  updatePropertyPoi,
} from "@/features/pois/nearby-actions";
import type { PropertyPoiView, PropertyPoisView } from "@/features/pois/nearby-queries";
import { useAction } from "@/lib/use-action";
import { useHydrated } from "@/lib/use-hydrated";
import { formatDistance, formatDuration, type DistanceUnit } from "@/lib/units";

const measuredAt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

function travel(seconds: number | null, metres: number | null, unit: DistanceUnit): string {
  if (seconds == null) return "—";
  return metres != null
    ? `${formatDuration(seconds)} · ${formatDistance(metres, unit)}`
    : formatDuration(seconds);
}

/**
 * Nearby places of a listing (07 §4.5): place, type, straight distance, drive and walk
 * times, "show on site", text shown instead, drag to order, and "Recalculate".
 *
 * Props: `propertyId` of the saved listing; `initial` from `listPropertyPois(db, id)`;
 * `hasPin` whether the listing has a map pin; `distanceUnit` from Settings -> Market;
 * `readOnly` for the demo viewer. Changes save at once (they are not part of the form).
 */
export function NearbyPlaces({
  propertyId,
  initial,
  hasPin,
  distanceUnit,
  readOnly,
}: {
  propertyId: string;
  initial: PropertyPoisView;
  hasPin: boolean;
  distanceUnit: DistanceUnit;
  readOnly?: boolean;
}) {
  const hydrated = useHydrated();
  const [view, setView] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const recalc = useAction(recalculatePropertyPois, {
    success: (v) =>
      v.rows.length === 0
        ? "No places found within the search radius"
        : `${v.rows.length} ${v.rows.length === 1 ? "place" : "places"} measured`,
    onSuccess: (v) => {
      setView(v);
      setDrafts({});
    },
  });

  const setRow = (id: string, patch: Partial<PropertyPoiView>) =>
    setView((v) => ({ ...v, rows: v.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));

  async function save(row: PropertyPoiView, patch: { isShown?: boolean; overrideText?: string }) {
    const previous = { isShown: row.isShown, overrideText: row.overrideText };
    setRow(row.id, {
      ...(patch.isShown !== undefined ? { isShown: patch.isShown } : {}),
      ...(patch.overrideText !== undefined ? { overrideText: patch.overrideText || null } : {}),
    });
    const res = await updatePropertyPoi({ id: row.id, ...patch });
    if (!res.ok) {
      setRow(row.id, previous);
      toast.error(res.error);
      return;
    }
    setRow(row.id, res.data);
    if (patch.overrideText !== undefined) toast.success("Saved");
  }

  async function reorder(rows: PropertyPoiView[]) {
    const before = view.rows;
    setView((v) => ({ ...v, rows }));
    const res = await reorderPropertyPois({ propertyId, ids: rows.map((r) => r.id) });
    if (!res.ok) {
      setView((v) => ({ ...v, rows: before }));
      toast.error(res.error);
    }
  }

  const run = view.lastRun;
  const straightOnly = run?.status === "succeeded" && run.mode === "straight_line";
  const busy = recalc.pending || run?.status === "queued" || run?.status === "running";
  const grid =
    "grid gap-x-3 gap-y-1 sm:grid-cols-[minmax(10rem,1.6fr)_6rem_8.5rem_8.5rem_4.5rem_minmax(9rem,1.4fr)] sm:items-center";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-text-muted" aria-live="polite">
          {!hasPin
            ? "Drop the pin on the map; nearby places are measured right after."
            : recalc.pending
              ? "Measuring…"
              : run?.status === "queued" || run?.status === "running"
                ? "Measuring in the background…"
                : run && hydrated
                  ? `Last measured ${measuredAt.format(new Date(run.at))}`
                  : run
                    ? "Measured"
                    : "Not measured yet."}
        </p>
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasPin || recalc.pending}
            onClick={() => void recalc.run({ propertyId })}
          >
            <RefreshCwIcon className={cn(recalc.pending && "animate-spin")} /> Recalculate
          </Button>
        )}
      </div>

      {(straightOnly || (run?.note && run.status === "succeeded") || run?.error) && (
        <div
          role="note"
          className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-[13px] text-ink"
        >
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <p>
            {straightOnly && (
              <strong className="font-semibold">Straight-line distances only. </strong>
            )}
            {run?.status === "succeeded" ? run.note : `The last measurement failed: ${run?.error}`}
          </p>
        </div>
      )}

      {view.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[13px] text-text-muted">
          {hasPin && run?.status === "succeeded"
            ? "No places within the search radius of each type. Add places in Setup -> Places, or widen a type's radius."
            : "Nothing measured yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <div
            className={cn(grid, "hidden px-11 text-[12px] font-semibold text-text-muted sm:grid")}
            aria-hidden
          >
            <span>Place</span>
            <span>Distance</span>
            <span>Drive</span>
            <span>Walk</span>
            <span>On site</span>
            <span>Text shown instead</span>
          </div>
          <SortableList
            items={view.rows}
            disabled={readOnly || busy}
            onReorder={(rows) => void reorder(rows)}
            label={(r) => `Move ${r.name}`}
            renderItem={(r) => (
              <div className={cn(grid, "py-1 text-[13px]", !r.isShown && "opacity-60")}>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{r.name}</p>
                  <p className="truncate text-[12px] text-text-muted">{r.typeName}</p>
                </div>
                <span className="tabular">
                  <span className="sr-only">Straight-line distance </span>
                  {formatDistance(r.straightDistanceM, distanceUnit)}
                </span>
                <span className="tabular">
                  <span className="sr-only">Drive </span>
                  {travel(r.driveSeconds, r.driveDistanceM, distanceUnit)}
                </span>
                <span className="tabular">
                  <span className="sr-only">Walk </span>
                  {travel(r.walkSeconds, r.walkDistanceM, distanceUnit)}
                </span>
                <Switch
                  checked={r.isShown}
                  disabled={readOnly}
                  aria-label={`Show ${r.name} on the site`}
                  onCheckedChange={(isShown) => void save(r, { isShown })}
                />
                <Input
                  value={drafts[r.id] ?? r.overrideText ?? ""}
                  maxLength={120}
                  disabled={readOnly}
                  placeholder="e.g. 5 min walk via the bridge"
                  aria-label={`Text shown instead for ${r.name}`}
                  onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                  onBlur={() => {
                    const text = (drafts[r.id] ?? r.overrideText ?? "").trim();
                    if (text !== (r.overrideText ?? "")) void save(r, { overrideText: text });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  className="h-8"
                />
              </div>
            )}
          />
        </div>
      )}
      {!view.mapsConfigured && view.rows.length > 0 && !straightOnly && (
        <p className="text-[12.5px] text-text-muted">
          {"Travel times need a Google Maps key (Settings -> Integrations)."}
        </p>
      )}
    </div>
  );
}
