"use client";

import { DownloadCloudIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTable, UrlFilterSelect, type ColumnDef } from "@/components/admin/data-table";
import { NumberField, SelectField, SwitchField, TextInputField } from "@/components/admin/fields";
import { SidePanel } from "@/components/admin/side-panel";
import { PinPicker } from "@/components/maps/pin-picker";
import { Button } from "@/components/ui/button";
import { geocodeAddress } from "@/features/locations/actions";
import {
  deletePois,
  importGooglePlaces,
  savePoi,
  searchGooglePlaces,
  setPoisActive,
} from "@/features/pois/actions";
import type { PoiRow } from "@/features/pois/queries";
import type { PoiInput } from "@/features/pois/schema";
import type { LngLat } from "@/lib/geo";
import { Icon } from "@/lib/icons";
import { useAction } from "@/lib/use-action";

type TypeOption = {
  id: string;
  name: string;
  icon: string | null;
  googlePlaceType: string | null;
  defaultSearchRadiusM: number;
};

type Found = {
  googlePlaceId: string;
  name: string;
  address: string;
  point: LngLat;
  website: string | null;
  alreadyImported: boolean;
};

export function PoisManager({
  rows,
  total,
  page,
  pageSize,
  sort,
  types,
  centers,
  styleUrl,
  mapCenter,
  googleReady,
  readOnly,
}: {
  rows: PoiRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: { id: string; desc: boolean };
  types: TypeOption[];
  centers: Array<{ id: string; name: string; center: LngLat }>;
  styleUrl: string;
  mapCenter: LngLat;
  googleReady: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const [editing, setEditing] = useState<{ id: string | null; data: PoiInput } | null>(null);
  const [importing, setImporting] = useState<{
    poiTypeId: string;
    centerId: string;
    radiusM: number;
    results: Found[] | null;
    chosen: Set<string>;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = useAction(savePoi, {
    success: "Place saved",
    onSuccess: () => {
      setEditing(null);
      router.refresh();
    },
  });

  const columns = useMemo<ColumnDef<PoiRow, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        meta: { sortKey: "name", label: "Name" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{row.original.name}</p>
            {row.original.address && (
              <p className="truncate text-[12px] text-text-muted">{row.original.address}</p>
            )}
          </div>
        ),
      },
      {
        id: "type",
        header: "Type",
        meta: { sortKey: "type", label: "Type" },
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            <Icon name={row.original.typeIcon} className="size-3.5 text-text-muted" />
            {row.original.typeName}
          </span>
        ),
      },
      {
        id: "source",
        header: "Source",
        meta: { label: "Source" },
        cell: ({ row }) => (row.original.googlePlaceId ? "Google" : "Added by hand"),
      },
      {
        id: "active",
        header: "Status",
        meta: { label: "Status" },
        cell: ({ row }) =>
          row.original.isActive ? (
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-[12px] font-semibold text-success">
              Active
            </span>
          ) : (
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[12px] font-semibold text-text-muted">
              Hidden
            </span>
          ),
      },
    ],
    [],
  );

  const newPoi = (): PoiInput => ({
    poiTypeId: types[0]?.id ?? "",
    name: "",
    address: null,
    point: mapCenter,
    googlePlaceId: null,
    website: null,
    ratingNote: null,
    isActive: true,
  });

  const set = (patch: Partial<PoiInput>) =>
    setEditing((e) => (e ? { ...e, data: { ...e.data, ...patch } } : e));

  return (
    <>
      <DataTable
        tableId="pois"
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        getRowId={(r) => r.id}
        searchPlaceholder="Search places"
        onRowClick={(r) =>
          setEditing({
            id: r.id,
            data: {
              poiTypeId: r.poiTypeId,
              name: r.name,
              address: r.address,
              point: r.point,
              googlePlaceId: r.googlePlaceId,
              website: r.website,
              ratingNote: r.ratingNote,
              isActive: r.isActive,
            },
          })
        }
        toolbar={
          <>
            <UrlFilterSelect
              param="type"
              label="Type"
              options={types.map((t) => ({ value: t.id, label: t.name }))}
            />
            <UrlFilterSelect
              param="active"
              label="Status"
              options={[
                { value: "yes", label: "Active" },
                { value: "no", label: "Hidden" },
              ]}
            />
            {!readOnly && (
              <>
                <Button
                  variant="outline"
                  disabled={types.length === 0}
                  onClick={() =>
                    setImporting({
                      poiTypeId: types.find((t) => t.googlePlaceType)?.id ?? types[0]?.id ?? "",
                      centerId: centers[0]?.id ?? "",
                      radiusM: types[0]?.defaultSearchRadiusM ?? 3000,
                      results: null,
                      chosen: new Set(),
                    })
                  }
                >
                  <DownloadCloudIcon /> Import from Google
                </Button>
                <Button
                  disabled={types.length === 0}
                  onClick={() => setEditing({ id: null, data: newPoi() })}
                >
                  <PlusIcon /> New place
                </Button>
              </>
            )}
          </>
        }
        bulkActions={
          readOnly
            ? undefined
            : (ids, clear) => (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const res = await setPoisActive({ ids, active: true });
                      if (res.ok) {
                        toast.success(`${res.data.count} shown`);
                        clear();
                        router.refresh();
                      } else toast.error(res.error);
                    }}
                  >
                    Show on site
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const res = await setPoisActive({ ids, active: false });
                      if (res.ok) {
                        toast.success(`${res.data.count} hidden`);
                        clear();
                        router.refresh();
                      } else toast.error(res.error);
                    }}
                  >
                    Hide
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      const res = await deletePois({ ids });
                      if (res.ok) {
                        toast.success(`${res.data.count} deleted`);
                        clear();
                        router.refresh();
                      } else toast.error(res.error);
                    }}
                  >
                    Delete
                  </Button>
                </>
              )
        }
        empty={
          types.length === 0 ? "Create POI types first (Setup -> POI types)." : "No places yet."
        }
      />

      <SidePanel
        wide
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? "Edit place" : "New place"}
        footer={
          !readOnly && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" form={formId} disabled={save.pending}>
                {save.pending ? "Saving…" : "Save"}
              </Button>
            </div>
          )
        }
      >
        {editing && (
          <form
            id={formId}
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save.run({ id: editing.id, data: editing.data });
            }}
          >
            <SelectField
              label="Type"
              value={editing.data.poiTypeId}
              onChange={(v) => set({ poiTypeId: v })}
              options={types.map((t) => ({ value: t.id, label: t.name }))}
              error={save.errorFor("poiTypeId")}
            />
            <TextInputField
              label="Name"
              required
              value={editing.data.name}
              onChange={(v) => set({ name: v })}
              error={save.errorFor("name")}
            />
            <TextInputField
              label="Address"
              value={editing.data.address ?? ""}
              onChange={(v) => set({ address: v || null })}
            />
            <PinPicker
              value={editing.data.point}
              onChange={(p) => set({ point: p })}
              styleUrl={styleUrl}
              fallbackCenter={mapCenter}
              zoom={14}
              className="h-64"
              onSearch={async (q) => {
                const res = await geocodeAddress(q);
                return res.ok ? res.data : { error: res.error };
              }}
            />
            <TextInputField
              label="Website"
              type="url"
              value={editing.data.website ?? ""}
              onChange={(v) => set({ website: v || null })}
              error={save.errorFor("website")}
            />
            <TextInputField
              label="Note"
              description='Optional, e.g. "British curriculum, ages 3-18". Shown on property pages.'
              value={editing.data.ratingNote ?? ""}
              onChange={(v) => set({ ratingNote: v || null })}
            />
            <TextInputField
              label="Google place id"
              value={editing.data.googlePlaceId ?? ""}
              onChange={(v) => set({ googlePlaceId: v || null })}
            />
            <SwitchField
              label="Show on property pages"
              checked={editing.data.isActive}
              onChange={(v) => set({ isActive: v })}
            />
          </form>
        )}
      </SidePanel>

      <SidePanel
        wide
        open={importing !== null}
        onOpenChange={(o) => !o && setImporting(null)}
        title="Import places from Google"
        description="Finds places of one type around a location. Places you already have are skipped."
        footer={
          importing?.results && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImporting(null)}>
                Cancel
              </Button>
              <Button
                disabled={busy || importing.chosen.size === 0}
                onClick={async () => {
                  if (!importing.results) return;
                  setBusy(true);
                  const places = importing.results
                    .filter((r) => importing.chosen.has(r.googlePlaceId))
                    .map(({ alreadyImported: _a, ...p }) => p);
                  const res = await importGooglePlaces({ poiTypeId: importing.poiTypeId, places });
                  setBusy(false);
                  if (res.ok) {
                    toast.success(
                      `${res.data.imported} places imported${res.data.skipped ? `, ${res.data.skipped} skipped` : ""}`,
                    );
                    setImporting(null);
                    router.refresh();
                  } else toast.error(res.error);
                }}
              >
                Import {importing.chosen.size} places
              </Button>
            </div>
          )
        }
      >
        {importing && !googleReady && (
          <p className="rounded-md border border-border bg-surface-soft p-3 text-[13px]">
            Add a Google Maps server key in Settings -&gt; Integrations to search Google Places.
            Until then, add places by hand: listing distances then use straight-line measurements.
          </p>
        )}
        {importing && (
          <div className="flex flex-col gap-4">
            <SelectField
              label="POI type"
              value={importing.poiTypeId}
              onChange={(v) =>
                setImporting((s) =>
                  s
                    ? {
                        ...s,
                        poiTypeId: v,
                        radiusM: types.find((t) => t.id === v)?.defaultSearchRadiusM ?? s.radiusM,
                        results: null,
                      }
                    : s,
                )
              }
              options={types.map((t) => ({
                value: t.id,
                label: `${t.name}${t.googlePlaceType ? "" : " (no Google type set)"}`,
              }))}
            />
            <SelectField
              label="Around"
              value={importing.centerId}
              onChange={(v) => setImporting((s) => (s ? { ...s, centerId: v, results: null } : s))}
              options={centers.map((c) => ({ value: c.id, label: c.name }))}
              placeholder={
                centers.length ? "Choose a location" : "Add a map point to a location first"
              }
            />
            <NumberField
              label="Radius"
              suffix="metres"
              min={100}
              max={50000}
              step={100}
              value={importing.radiusM}
              onChange={(v) => setImporting((s) => (s ? { ...s, radiusM: v ?? 3000 } : s))}
            />
            <Button
              variant="outline"
              disabled={busy || !googleReady || !importing.centerId}
              onClick={async () => {
                const center = centers.find((c) => c.id === importing.centerId)?.center;
                if (!center) return;
                setBusy(true);
                const res = await searchGooglePlaces({
                  poiTypeId: importing.poiTypeId,
                  center,
                  radiusM: importing.radiusM,
                });
                setBusy(false);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                setImporting((s) =>
                  s
                    ? {
                        ...s,
                        results: res.data,
                        chosen: new Set(
                          res.data.filter((r) => !r.alreadyImported).map((r) => r.googlePlaceId),
                        ),
                      }
                    : s,
                );
              }}
            >
              {busy ? "Searching…" : "Search Google Places"}
            </Button>
            {importing.results && (
              <ul className="divide-y divide-border rounded-md border border-border">
                {importing.results.length === 0 && (
                  <li className="p-3 text-[13px] text-text-muted">
                    No places found. Try a larger radius.
                  </li>
                )}
                {importing.results.map((r) => (
                  <li key={r.googlePlaceId} className="flex items-start gap-2 p-2.5">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--color-accent)]"
                      aria-label={`Import ${r.name}`}
                      disabled={r.alreadyImported}
                      checked={importing.chosen.has(r.googlePlaceId)}
                      onChange={(e) =>
                        setImporting((s) => {
                          if (!s) return s;
                          const chosen = new Set(s.chosen);
                          if (e.target.checked) chosen.add(r.googlePlaceId);
                          else chosen.delete(r.googlePlaceId);
                          return { ...s, chosen };
                        })
                      }
                    />
                    <div className="min-w-0 text-[13px]">
                      <p className="font-semibold text-ink">{r.name}</p>
                      <p className="text-text-muted">
                        {r.alreadyImported ? "Already imported" : r.address}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </SidePanel>
    </>
  );
}
