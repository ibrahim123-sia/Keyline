"use client";

import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { LocateFixedIcon, SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BaseMap, type LngLat, type MapLibreModule } from "./base-map";

/** "25.0805, 55.1403" (lat, lng as maps apps copy it) or "lng=55.14 lat=25.08". */
export function parseCoordinates(text: string): LngLat | null {
  const nums = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
  if (!nums || nums.length < 2) return null;
  const [a, b] = nums as [number, number];
  const lngFirst = /lng|lon/i.test(text) && text.search(/lng|lon/i) < text.search(/lat/i);
  const p = lngFirst ? { lng: a, lat: b } : { lat: a, lng: b };
  return Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 ? p : null;
}

/**
 * Map pin picker (07 §3 Location): drag the pin, click the map, search an address, or paste
 * coordinates. Used for listings, projects, locations, POIs and the office address.
 */
export function PinPicker({
  value,
  onChange,
  styleUrl,
  fallbackCenter,
  zoom = 13,
  onSearch,
  className = "h-80",
}: {
  value: LngLat | null;
  onChange: (p: LngLat) => void;
  styleUrl: string;
  fallbackCenter: LngLat;
  zoom?: number;
  onSearch?: (query: string) => Promise<{ point: LngLat; label: string } | { error: string }>;
  className?: string;
}) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const libRef = useRef<MapLibreModule | null>(null);
  const onChangeRef = useRef(onChange);
  const [coords, setCoords] = useState(
    value ? `${value.lat.toFixed(6)}, ${value.lng.toFixed(6)}` : "",
  );
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  function place(p: LngLat, fly = false) {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib) return;
    if (!markerRef.current) {
      const el = document.createElement("div");
      el.className =
        "size-5 rounded-full border-[3px] border-white bg-[var(--color-accent)] shadow-pin";
      markerRef.current = new lib.Marker({ element: el, draggable: true })
        .setLngLat([p.lng, p.lat])
        .addTo(map);
      markerRef.current.on("dragend", () => {
        const ll = markerRef.current!.getLngLat();
        const next = { lng: round(ll.lng), lat: round(ll.lat) };
        setCoords(`${next.lat}, ${next.lng}`);
        onChangeRef.current(next);
      });
    } else {
      markerRef.current.setLngLat([p.lng, p.lat]);
    }
    if (fly) map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 15) });
  }

  async function runSearch() {
    if (!onSearch || !query.trim()) return;
    setSearching(true);
    setMessage(null);
    const res = await onSearch(query.trim());
    setSearching(false);
    if ("error" in res) {
      setMessage(res.error);
      return;
    }
    setCoords(`${res.point.lat}, ${res.point.lng}`);
    onChange(res.point);
    place(res.point, true);
    setMessage(res.label);
  }

  // Keep the marker in sync when the value changes from outside (paste, search, reset).
  useEffect(() => {
    if (value) place(value);
  }, [value]);

  return (
    <div className="flex flex-col gap-2">
      {onSearch && (
        // Not a <form>: the picker usually sits inside the editor's own form (no nested forms).
        <div className="flex gap-2" role="search">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch();
              }
            }}
            placeholder="Search an address or place"
            aria-label="Search an address or place"
          />
          <Button
            type="button"
            variant="outline"
            disabled={searching}
            onClick={() => void runSearch()}
          >
            <SearchIcon /> Find
          </Button>
        </div>
      )}
      <BaseMap
        styleUrl={styleUrl}
        center={value ?? fallbackCenter}
        zoom={value ? Math.max(zoom, 14) : zoom}
        className={`${className} rounded-md border border-border`}
        label="Map: click or drag the pin to set the location"
        lazy={false}
        onReady={(map, lib) => {
          mapRef.current = map;
          libRef.current = lib;
          if (value) place(value);
          map.on("click", (e) => {
            const next = { lng: round(e.lngLat.lng), lat: round(e.lngLat.lat) };
            place(next);
            setCoords(`${next.lat}, ${next.lng}`);
            onChangeRef.current(next);
          });
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[12.5px] font-semibold text-ink" htmlFor="pin-coords">
          Coordinates (lat, lng)
        </label>
        <Input
          id="pin-coords"
          className="w-60 font-mono text-[12.5px]"
          value={coords}
          onChange={(e) => setCoords(e.target.value)}
          onBlur={() => {
            const p = parseCoordinates(coords);
            if (p) {
              onChange({ lng: round(p.lng), lat: round(p.lat) });
              place(p, true);
            } else if (coords.trim()) setMessage("Paste coordinates like 25.0805, 55.1403");
          }}
        />
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => place(value, true)}>
            <LocateFixedIcon /> Centre on pin
          </Button>
        )}
      </div>
      {message && <p className="text-[12.5px] text-text-muted">{message}</p>}
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
