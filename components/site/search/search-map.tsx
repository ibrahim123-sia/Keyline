"use client";

import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { PencilLineIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type * as TerraDrawLib from "terra-draw";
import type { TerraDraw } from "terra-draw";
import { cn } from "cn";
import { BaseMap, type MapLibreModule } from "@/components/maps/base-map";
import type { CardContext } from "@/components/site/listings/listing-card";
import { searchHref, type SearchFilters } from "@/features/search/params";
import type { SearchPin } from "@/features/search/query";
import { compactAmount, fromBaseMinor, toBaseMinor } from "@/lib/currency-display";
import { format } from "@/lib/i18n";
import { search as t } from "@/lib/i18n/dictionaries/search";

type DrawLib = typeof TerraDrawLib;
type Ring = Array<[number, number]>;

const APPROX_RADIUS_M = 450;
const round5 = (v: number) => Math.round(v * 1e5) / 1e5;

function decimalsOf(code: string, ctx: CardContext): number {
  if (code === ctx.rates.base.code) return ctx.rates.base.decimals;
  return ctx.rates.others.find((c) => c.code === code)?.decimals ?? 2;
}

/** Price pill text in the visitor's currency: "2.45M", "≈667K" (06 §4.5). */
export function pinLabel(pin: SearchPin, ctx: CardContext): string {
  if (pin.price == null) return t.map.onRequest;
  if (ctx.visitorCurrency === pin.currency)
    return compactAmount(pin.price, decimalsOf(pin.currency, ctx));
  const base = toBaseMinor(pin.price, pin.currency, ctx.rates);
  const converted = base == null ? null : fromBaseMinor(base, ctx.visitorCurrency, ctx.rates);
  return converted == null
    ? compactAmount(pin.price, decimalsOf(pin.currency, ctx))
    : `≈${compactAmount(converted, decimalsOf(ctx.visitorCurrency, ctx))}`;
}

/** Pixel radius of an approximate area at each zoom, at the map's latitude. */
function approxRadius(lat: number): unknown {
  const mpp = (z: number) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
  return [
    "interpolate",
    ["exponential", 2],
    ["zoom"],
    8,
    APPROX_RADIUS_M / mpp(8),
    20,
    APPROX_RADIUS_M / mpp(20),
  ];
}

function bounds(points: Array<[number, number]>): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  let [minX, minY] = points[0]!;
  let [maxX, maxY] = points[0]!;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

const pinClass =
  "rounded-full bg-surface px-2 py-1 text-[12px] leading-none font-semibold whitespace-nowrap text-ink shadow-pin ring-1 ring-ink/10 transition-colors hover:bg-accent hover:text-on-accent data-[hover=true]:bg-accent data-[hover=true]:text-on-accent data-[selected=true]:bg-ink data-[selected=true]:text-surface data-[selected=true]:ring-0";
const clusterClass =
  "flex items-center justify-center rounded-full bg-ink/90 text-[12.5px] font-semibold text-surface shadow-pin ring-4 ring-ink/15 hover:bg-ink";

/**
 * The results map (06 §4.5): price pills, clusters with counts when zoomed out, the
 * selected pin dark, approximate circles for listings without a public exact pin, hover
 * sync with the list, "Search as I move the map" and "Draw your area".
 */
export function SearchMap({
  pinsQuery,
  filters,
  styleUrl,
  center,
  zoom,
  ctx,
  hovered,
  selected,
  onHover,
  onSelect,
  className,
  lazy = true,
  children,
}: {
  pinsQuery: string;
  filters: SearchFilters;
  styleUrl: string;
  center: { lng: number; lat: number };
  zoom: number;
  ctx: CardContext;
  hovered: string | null;
  selected: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  className?: string;
  lazy?: boolean;
  children?: ReactNode;
}) {
  const router = useRouter();
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<MapLibreModule | null>(null);
  const markers = useRef(new Map<string, { marker: Marker; el: HTMLElement }>());
  const drawRef = useRef<TerraDraw | null>(null);
  const [ready, setReady] = useState(false);
  const [moveSearch, setMoveSearch] = useState(false);
  const [drawing, setDrawing] = useState(false);
  // The pins query whose pins are on the map ("loading" until it matches the current one).
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const latest = useRef({ filters, ctx, onHover, onSelect, moveSearch, hovered, selected });
  useEffect(() => {
    latest.current = { filters, ctx, onHover, onSelect, moveSearch, hovered, selected };
  });

  const paint = useCallback(() => {
    const { hovered: h, selected: s } = latest.current;
    for (const [key, { el }] of markers.current) {
      if (!key.startsWith("p:")) continue;
      const id = key.slice(2);
      el.dataset.hover = String(id === h);
      el.dataset.selected = String(id === s);
      el.style.zIndex = id === s ? "3" : id === h ? "2" : "";
    }
  }, []);

  /** Keeps one DOM marker per visible cluster or pin (no fonts needed from the style). */
  const syncMarkers = useCallback(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib || !map.getSource("pins") || !map.isSourceLoaded("pins")) return;
    const seen = new Set<string>();
    for (const feature of map.querySourceFeatures("pins")) {
      const props = feature.properties as {
        cluster?: boolean;
        cluster_id?: number;
        point_count?: number;
        id?: string;
        label?: string;
      };
      const [lng, lat] = (feature.geometry as unknown as { coordinates: [number, number] })
        .coordinates;
      const key = props.cluster ? `c:${props.cluster_id}` : `p:${props.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (markers.current.has(key)) continue;
      const el = document.createElement("button");
      el.type = "button";
      if (props.cluster) {
        const count = props.point_count ?? 0;
        const size = count < 10 ? 34 : count < 100 ? 42 : 50;
        el.className = clusterClass;
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.textContent = count >= 1000 ? `${Math.round(count / 100) / 10}k` : String(count);
        el.setAttribute("aria-label", format(t.map.cluster, { count }));
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const source = map.getSource("pins") as GeoJSONSource;
          void source
            .getClusterExpansionZoom(props.cluster_id!)
            .then((z) => map.easeTo({ center: [lng, lat], zoom: Math.min(z, 18) }));
        });
      } else {
        const id = props.id!;
        el.className = pinClass;
        el.textContent = props.label ?? "";
        el.setAttribute("aria-label", props.label ?? "");
        el.dataset.pinId = id;
        el.addEventListener("mouseenter", () => latest.current.onHover(id));
        el.addEventListener("mouseleave", () => latest.current.onHover(null));
        el.addEventListener("focus", () => latest.current.onHover(id));
        el.addEventListener("blur", () => latest.current.onHover(null));
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          latest.current.onSelect(id);
        });
      }
      const marker = new lib.Marker({ element: el, anchor: "center" })
        .setLngLat([lng, lat])
        .addTo(map);
      markers.current.set(key, { marker, el });
    }
    for (const [key, { marker }] of markers.current) {
      if (!seen.has(key)) {
        marker.remove();
        markers.current.delete(key);
      }
    }
    paint();
  }, [paint]);

  const onReady = useCallback(
    (map: MapLibreMap, lib: MapLibreModule) => {
      mapRef.current = map;
      libRef.current = lib;
      map.addSource("pins", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 46,
        clusterMaxZoom: 15,
      });
      map.addSource("approx", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("poly", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      // Invisible: makes the source load its tiles so markers can be read from it.
      map.addLayer({
        id: "pins-hit",
        type: "circle",
        source: "pins",
        paint: { "circle-radius": 0, "circle-opacity": 0 },
      });
      map.addLayer({
        id: "approx-area",
        type: "circle",
        source: "approx",
        paint: {
          "circle-radius": approxRadius(center.lat) as never,
          "circle-color": "#a9502f",
          "circle-opacity": 0.12,
          "circle-stroke-color": "#a9502f",
          "circle-stroke-opacity": 0.45,
          "circle-stroke-width": 1.5,
        },
      });
      map.addLayer({
        id: "poly-fill",
        type: "fill",
        source: "poly",
        paint: { "fill-color": "#a9502f", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "poly-line",
        type: "line",
        source: "poly",
        paint: { "line-color": "#a9502f", "line-width": 2, "line-dasharray": [2, 1] },
      });
      map.on("render", syncMarkers);
      map.on("click", () => latest.current.onSelect(null));
      let timer: ReturnType<typeof setTimeout> | undefined;
      map.on("moveend", (e) => {
        if (!latest.current.moveSearch || !(e as { originalEvent?: unknown }).originalEvent) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          const b = map.getBounds();
          const ring: Ring = [
            [round5(b.getWest()), round5(b.getSouth())],
            [round5(b.getEast()), round5(b.getSouth())],
            [round5(b.getEast()), round5(b.getNorth())],
            [round5(b.getWest()), round5(b.getNorth())],
          ];
          router.replace(searchHref({ ...latest.current.filters, poly: ring, page: 1 }), {
            scroll: false,
          });
        }, 500);
      });
      setReady(true);
    },
    [center.lat, router, syncMarkers],
  );

  // Pins for the current search; the map keeps its camera while "search as I move" is on.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    const controller = new AbortController();
    fetch(`/api/search/pins?${pinsQuery}`, { signal: controller.signal })
      .then((r) => r.json() as Promise<{ pins: SearchPin[] }>)
      .then(({ pins }) => {
        const { ctx: c, moveSearch: moving, filters: f } = latest.current;
        for (const { marker } of markers.current.values()) marker.remove();
        markers.current.clear();
        (map.getSource("pins") as GeoJSONSource).setData({
          type: "FeatureCollection",
          features: pins.map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.lng, p.lat] },
            properties: { id: p.id, label: pinLabel(p, c) },
          })),
        });
        (map.getSource("approx") as GeoJSONSource).setData({
          type: "FeatureCollection",
          features: pins
            .filter((p) => p.approx)
            .map((p) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [p.lng, p.lat] },
              properties: {},
            })),
        });
        if (!moving) {
          const box = bounds(f.poly ?? pins.map((p) => [p.lng, p.lat] as [number, number]));
          if (box) map.fitBounds(box, { padding: 56, maxZoom: 15, duration: 0 });
        }
        setLoadedQuery(pinsQuery);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadedQuery(pinsQuery);
      });
    return () => controller.abort();
  }, [ready, pinsQuery]);

  // The drawn or moved-to area.
  const polyKey = filters.poly ? JSON.stringify(filters.poly) : "";
  useEffect(() => {
    if (!ready) return;
    const ring = polyKey ? (JSON.parse(polyKey) as Ring) : null;
    (mapRef.current!.getSource("poly") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: ring
        ? [
            {
              type: "Feature",
              geometry: { type: "Polygon", coordinates: [[...ring, ring[0]!]] },
              properties: {},
            },
          ]
        : [],
    });
  }, [ready, polyKey]);

  useEffect(() => {
    paint();
  }, [hovered, selected, paint]);

  useEffect(() => () => drawRef.current?.stop(), []);

  async function startDrawing() {
    const map = mapRef.current;
    if (!map || drawRef.current) return;
    const [draw, { TerraDrawMapLibreGLAdapter }] = await Promise.all([
      import("terra-draw") as Promise<DrawLib>,
      import("terra-draw-maplibre-gl-adapter"),
    ]);
    const accent = "#A9502F";
    const instance = new draw.TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [
        new draw.TerraDrawPolygonMode({
          styles: { fillColor: accent, fillOpacity: 0.15, outlineColor: accent, outlineWidth: 2 },
        }),
      ],
    });
    instance.start();
    instance.setMode("polygon");
    instance.on("finish", (id) => {
      const feature = instance.getSnapshot().find((x) => x.id === id);
      const coords = (feature?.geometry as { coordinates?: number[][][] } | undefined)
        ?.coordinates?.[0];
      stopDrawing();
      if (!coords || coords.length < 4) return;
      const ring = coords
        .slice(0, -1)
        .map(([lng, lat]) => [round5(lng!), round5(lat!)] as [number, number]);
      setMoveSearch(false);
      router.push(searchHref({ ...latest.current.filters, poly: ring, page: 1 }), {
        scroll: false,
      });
    });
    drawRef.current = instance;
    setDrawing(true);
  }

  function stopDrawing() {
    drawRef.current?.stop();
    drawRef.current = null;
    setDrawing(false);
  }

  return (
    <BaseMap
      styleUrl={styleUrl}
      center={center}
      zoom={zoom}
      lazy={lazy}
      label={t.map.label}
      className={cn("bg-surface-muted", className)}
      onReady={onReady}
    >
      <div className="pointer-events-none absolute top-3 right-14 left-3 z-[5] flex flex-wrap justify-end gap-2">
        <label className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-surface px-3 py-2 text-[13px] font-medium text-ink shadow-pin">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-ink)]"
            checked={moveSearch}
            onChange={(e) => setMoveSearch(e.target.checked)}
          />
          {t.map.searchAsMove}
        </label>
        {drawing ? (
          <button
            type="button"
            onClick={stopDrawing}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-2 text-[13px] font-semibold text-surface shadow-pin"
          >
            <XIcon className="size-4" aria-hidden />
            {t.filters.clear}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startDrawing()}
            disabled={!ready}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-2 text-[13px] font-semibold text-ink shadow-pin disabled:opacity-60"
          >
            <PencilLineIcon className="size-4" aria-hidden />
            {t.map.draw}
          </button>
        )}
        {filters.poly && !drawing && (
          <button
            type="button"
            onClick={() =>
              router.push(searchHref({ ...filters, poly: null, page: 1 }), { scroll: false })
            }
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-2 text-[13px] font-semibold text-accent shadow-pin"
          >
            <XIcon className="size-4" aria-hidden />
            {t.map.clearDrawing}
          </button>
        )}
      </div>
      {drawing && (
        <p className="absolute bottom-3 left-1/2 z-[5] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[13px] text-surface shadow-pin">
          {t.map.drawing}
        </p>
      )}
      {ready && loadedQuery !== pinsQuery && (
        <p
          className="absolute top-14 left-3 z-[5] rounded-full bg-surface px-3 py-1 text-[12px] text-text-muted shadow-pin"
          role="status"
        >
          {t.map.loading}
        </p>
      )}
      {children}
    </BaseMap>
  );
}
