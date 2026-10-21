"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { BaseMap, type LngLat, type MapLibreModule } from "@/components/maps/base-map";

export type MapPlace = { id: string; name: string; point: LngLat };

/**
 * A place on the map with nearby places around it (project pages). The map library loads
 * only when the map scrolls into view.
 */
export function PlaceMap({
  center,
  places = [],
  styleUrl,
  label,
  zoom = 14,
}: {
  center: LngLat;
  places?: MapPlace[];
  styleUrl: string;
  label: string;
  zoom?: number;
}) {
  const onReady = (map: MapLibreMap, maplibre: MapLibreModule) => {
    const pin = document.createElement("div");
    pin.className =
      "size-5 rounded-full border-[3px] border-white bg-[var(--color-accent)] shadow-pin";
    new maplibre.Marker({ element: pin }).setLngLat([center.lng, center.lat]).addTo(map);
    for (const p of places) {
      const dot = document.createElement("div");
      dot.className = "size-3 rounded-full border-2 border-white bg-[var(--color-ink)]";
      dot.title = p.name;
      new maplibre.Marker({ element: dot }).setLngLat([p.point.lng, p.point.lat]).addTo(map);
    }
    if (places.length) {
      const bounds = new maplibre.LngLatBounds([center.lng, center.lat], [center.lng, center.lat]);
      for (const p of places) bounds.extend([p.point.lng, p.point.lat]);
      map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
    }
  };
  return (
    <BaseMap
      styleUrl={styleUrl}
      center={center}
      zoom={zoom}
      label={label}
      onReady={onReady}
      className="h-80 w-full overflow-hidden rounded-[20px] md:h-96"
    />
  );
}
