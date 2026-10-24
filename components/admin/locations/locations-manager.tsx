"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MapPinIcon,
  PlusIcon,
  SearchIcon,
  ShapesIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { SelectField, SwitchField, TextInputField, TextareaField } from "@/components/admin/fields";
import { FormSection } from "@/components/admin/page-header";
import { SeoFields } from "@/components/admin/seo-fields";
import { PinPicker } from "@/components/maps/pin-picker";
import { PolygonEditor } from "@/components/maps/polygon-editor";
import { PriceFigures, type PriceFigureOptions } from "./price-figures";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LocationLevel } from "@/db/schema/master-data";
import {
  deleteLocation,
  geocodeAddress,
  getLocationDetail,
  reorderLocations,
  saveLocation,
} from "@/features/locations/actions";
import type { LocationNode } from "@/features/locations/queries";
import { levelLabels, levelRank, type LocationInput } from "@/features/locations/schema";
import type { GeoPolygon, LngLat } from "@/lib/geo";
import { useAction } from "@/lib/use-action";

type Draft = LocationInput & {
  id: string | null;
  usage?: { total: number; children: number; agents: number };
};

const emptyDraft = (parentId: string | null, level: LocationLevel): Draft => ({
  id: null,
  parentId,
  level,
  name: "",
  slug: "",
  center: null,
  geom: null,
  description: null,
  isFeatured: false,
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  noindex: false,
  ogImageId: null,
});

const nextLevel = (level: LocationLevel | null): LocationLevel => {
  const order: LocationLevel[] = ["country", "city", "area", "community", "building"];
  return level ? order[Math.min(order.indexOf(level) + 1, order.length - 1)]! : "country";
};

export function LocationsManager({
  nodes,
  styleUrl,
  mapCenter,
  mapZoom,
  siteName,
  readOnly,
  priceOptions,
}: {
  nodes: LocationNode[];
  styleUrl: string;
  mapCenter: LngLat;
  mapZoom: number;
  siteName: string;
  readOnly?: boolean;
  /** Price trend figures for the chosen location (11 §7). */
  priceOptions: PriceFigureOptions;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(nodes.filter((n) => !n.parentId).map((n) => n.id)),
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [showBoundary, setShowBoundary] = useState(false);

  const children = useMemo(() => {
    const map = new Map<string | null, LocationNode[]>();
    for (const n of nodes) {
      const list = map.get(n.parentId) ?? [];
      list.push(n);
      map.set(n.parentId, list);
    }
    return map;
  }, [nodes]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const save = useAction(saveLocation, {
    success: "Location saved",
    onSuccess: (data) => {
      setDraft((d) => (d ? { ...d, id: data.id, slug: data.slug } : d));
      router.refresh();
    },
  });

  async function select(id: string) {
    setLoadingId(id);
    const res = await getLocationDetail(id);
    setLoadingId(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const d = res.data;
    setShowBoundary(Boolean(d.geom));
    setDraft({
      id: d.id,
      parentId: d.parentId,
      level: d.level,
      name: d.name,
      slug: d.slug,
      center: d.center,
      geom: d.geom as GeoPolygon | null,
      description: d.description,
      isFeatured: d.isFeatured,
      seoTitle: d.seoTitle,
      seoDescription: d.seoDescription,
      canonicalUrl: d.canonicalUrl,
      noindex: d.noindex,
      ogImageId: d.ogImageId,
      usage: d.usage,
    });
  }

  function addChild(parent: LocationNode | null) {
    setShowBoundary(false);
    setDraft(emptyDraft(parent?.id ?? null, nextLevel(parent?.level ?? null)));
    if (parent) setExpanded((e) => new Set(e).add(parent.id));
  }

  async function move(node: LocationNode, dir: -1 | 1) {
    const siblings = children.get(node.parentId) ?? [];
    const i = siblings.findIndex((s) => s.id === node.id);
    const j = i + dir;
    if (j < 0 || j >= siblings.length) return;
    const ids = siblings.map((s) => s.id);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    const res = await reorderLocations({ parentId: node.parentId, ids });
    if (res.ok) router.refresh();
    else toast.error(res.error);
  }

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    const keep = new Set<string>();
    for (const n of nodes) {
      if (n.name.toLowerCase().includes(q)) {
        let cur: LocationNode | undefined = n;
        while (cur) {
          keep.add(cur.id);
          cur = cur.parentId ? byId.get(cur.parentId) : undefined;
        }
      }
    }
    return keep;
  }, [q, nodes, byId]);

  function renderLevel(parentId: string | null, depth: number) {
    const list = (children.get(parentId) ?? []).filter((n) => !matches || matches.has(n.id));
    if (list.length === 0) return null;
    return (
      <ul role={depth === 0 ? "tree" : "group"} aria-label={depth === 0 ? "Locations" : undefined}>
        {list.map((n, index) => {
          const kids = children.get(n.id) ?? [];
          const open = matches ? true : expanded.has(n.id);
          const selected = draft?.id === n.id;
          return (
            <li
              key={n.id}
              role="treeitem"
              aria-expanded={kids.length ? open : undefined}
              aria-selected={selected}
            >
              <div
                className={cn(
                  "group flex items-center gap-1 rounded-md py-1 pe-1 text-[13px]",
                  selected ? "bg-accent-soft" : "hover:bg-surface-muted",
                )}
                style={{ paddingInlineStart: depth * 16 + 4 }}
              >
                <button
                  type="button"
                  className={cn(
                    "flex size-6 items-center justify-center rounded text-text-muted",
                    !kids.length && "invisible",
                  )}
                  aria-label={open ? `Collapse ${n.name}` : `Expand ${n.name}`}
                  onClick={() =>
                    setExpanded((e) => {
                      const next = new Set(e);
                      if (next.has(n.id)) next.delete(n.id);
                      else next.add(n.id);
                      return next;
                    })
                  }
                >
                  {open ? (
                    <ChevronDownIcon className="size-3.5" />
                  ) : (
                    <ChevronRightIcon className="size-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-start"
                  onClick={() => void select(n.id)}
                >
                  <span className="truncate font-medium text-ink">{n.name}</span>
                  <span className="shrink-0 text-[11px] text-text-muted">
                    {levelLabels[n.level]}
                  </span>
                  {n.isFeatured && (
                    <StarIcon className="size-3 shrink-0 text-accent" aria-label="Featured" />
                  )}
                  {!n.hasCenter && (
                    <MapPinIcon
                      className="size-3 shrink-0 text-danger"
                      aria-label="No map point yet"
                    />
                  )}
                  {n.hasBoundary && (
                    <ShapesIcon
                      className="size-3 shrink-0 text-text-muted"
                      aria-label="Has a boundary"
                    />
                  )}
                  {loadingId === n.id && <span className="text-[11px] text-text-muted">…</span>}
                </button>
                {!readOnly && (
                  <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Move ${n.name} up`}
                      disabled={index === 0}
                      onClick={() => void move(n, -1)}
                    >
                      <ArrowUpIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Move ${n.name} down`}
                      disabled={index === list.length - 1}
                      onClick={() => void move(n, 1)}
                    >
                      <ArrowDownIcon />
                    </Button>
                    {n.level !== "building" && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Add a location inside ${n.name}`}
                        onClick={() => addChild(n)}
                      >
                        <PlusIcon />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {open && renderLevel(n.id, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  }

  const parentOptions = draft
    ? nodes
        .filter((n) => levelRank[n.level] < levelRank[draft.level] && n.id !== draft.id)
        .map((n) => ({ value: n.id, label: `${n.name} (${levelLabels[n.level]})` }))
    : [];

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const parentPrefix = "/buy/";

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[320px_1fr]">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 lg:sticky lg:top-20">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon
              className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search locations"
              className="ps-8"
            />
          </div>
          {!readOnly && (
            <Button onClick={() => addChild(null)} aria-label="New top-level location">
              <PlusIcon /> New
            </Button>
          )}
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {nodes.length === 0 ? (
            <p className="px-2 py-6 text-center text-[13px] text-text-muted">
              No locations yet. Start with a country or a city.
            </p>
          ) : (
            renderLevel(null, 0)
          )}
        </div>
      </div>

      {!draft ? (
        <EmptyState
          title="Choose a location"
          description="Select a location in the tree to edit it, or create a new one."
          icon={<MapPinIcon className="size-5" />}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const { id, usage: _usage, ...data } = draft;
              void save.run({ id, data });
            }}
          >
            <FormSection
              title={draft.id ? `Edit ${draft.name || "location"}` : "New location"}
              actions={
                !readOnly &&
                draft.id && (
                  <ConfirmDialog
                    title={`Delete ${draft.name}?`}
                    description={
                      draft.usage && draft.usage.total > 0
                        ? "It still has sub-locations or agent profiles, so it cannot be deleted yet."
                        : "This cannot be undone."
                    }
                    confirmLabel="Delete"
                    destructive
                    onConfirm={async () => {
                      const res = await deleteLocation({ id: draft.id! });
                      if (res.ok) {
                        toast.success("Location deleted");
                        setDraft(null);
                        router.refresh();
                      } else toast.error(res.error);
                    }}
                    trigger={
                      <Button type="button" variant="ghost" size="sm">
                        <Trash2Icon /> Delete
                      </Button>
                    }
                  />
                )
              }
            >
              <div className="grid gap-4 md:grid-cols-2">
                <SelectField
                  label="Level"
                  value={draft.level}
                  onChange={(v) => set({ level: v })}
                  error={save.errorFor("level")}
                  options={(Object.keys(levelLabels) as LocationLevel[]).map((l) => ({
                    value: l,
                    label: levelLabels[l],
                  }))}
                />
                <SelectField
                  label="Inside"
                  value={draft.parentId ?? "__root"}
                  onChange={(v) => set({ parentId: v === "__root" ? null : v })}
                  error={save.errorFor("parentId")}
                  options={[{ value: "__root", label: "Nothing (top level)" }, ...parentOptions]}
                />
                <TextInputField
                  label="Name"
                  required
                  value={draft.name}
                  onChange={(v) => set({ name: v })}
                  error={save.errorFor("name")}
                />
                <SwitchField
                  label="Featured"
                  description="Shown in area lists and the home page."
                  checked={draft.isFeatured}
                  onChange={(v) => set({ isFeatured: v })}
                />
              </div>
              <TextareaField
                label="Short description"
                description="Used as the intro on search landing pages when there is no area guide."
                rows={3}
                maxLength={2000}
                value={draft.description ?? ""}
                onChange={(v) => set({ description: v || null })}
              />
            </FormSection>

            <FormSection
              title="Map point"
              description="Centre of the area, or the building's entrance."
            >
              <PinPicker
                value={draft.center}
                onChange={(p) => set({ center: p })}
                styleUrl={styleUrl}
                fallbackCenter={draft.center ?? (draft.parentId ? mapCenter : mapCenter)}
                zoom={draft.center ? 14 : mapZoom}
                onSearch={async (query) => {
                  const res = await geocodeAddress(query);
                  return res.ok ? res.data : { error: res.error };
                }}
              />
            </FormSection>

            <FormSection
              title="Boundary"
              description="Optional. Draw the area's outline for map search and area pages."
              actions={
                !showBoundary && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBoundary(true)}
                  >
                    Draw boundary
                  </Button>
                )
              }
            >
              {showBoundary ? (
                <PolygonEditor
                  value={draft.geom}
                  onChange={(g) => set({ geom: g })}
                  styleUrl={styleUrl}
                  center={draft.center ?? mapCenter}
                  zoom={draft.center ? 13 : mapZoom}
                />
              ) : (
                <p className="text-[13px] text-text-muted">
                  {draft.geom ? "A boundary is set." : "No boundary yet."}
                </p>
              )}
            </FormSection>

            <FormSection
              title="SEO"
              description={`Landing pages: ${parentPrefix}${draft.slug || "…"} and /rent/${draft.slug || "…"}`}
            >
              <SeoFields
                values={{
                  slug: draft.slug,
                  seoTitle: draft.seoTitle,
                  seoDescription: draft.seoDescription,
                  canonicalUrl: draft.canonicalUrl,
                  noindex: draft.noindex,
                  ogImageId: draft.ogImageId,
                }}
                onChange={(patch) => set(patch)}
                urlPrefix={parentPrefix}
                fallbackTitle={`Homes for sale in ${draft.name || "this area"} | ${siteName}`}
                fallbackDescription={draft.description ?? undefined}
                siteName={siteName}
                errorFor={save.errorFor}
              />
            </FormSection>

            {!readOnly && (
              <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                  Close
                </Button>
                <Button type="submit" disabled={save.pending}>
                  {save.pending ? "Saving…" : "Save location"}
                </Button>
              </div>
            )}
          </form>
          {draft.id && (
            <PriceFigures
              key={draft.id}
              locationId={draft.id}
              locationName={draft.name}
              options={priceOptions}
              readOnly={readOnly}
            />
          )}
        </div>
      )}
    </div>
  );
}
