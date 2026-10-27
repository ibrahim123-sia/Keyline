"use client";

import { BaseMap } from "@/components/maps/base-map";
import type { PublicPoint } from "@/features/listings/public-point";

/** A circle polygon (64 points) of `radiusM` around a point, for the approximate area. */
function circle(lng: number, lat: number, radiusM: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    out.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return out;
}

/**
 * Location map (06 §5.10): a pin, or an approximate circle when the listing keeps its exact
 * pin private (the point given here is already the approximate one). Loads when scrolled near.
 */
export function ListingMap({
  point,
  styleUrl,
  label,
}: {
  point: PublicPoint;
  styleUrl: string;
  label: string;
}) {
  return (
    <BaseMap
      styleUrl={styleUrl}
      center={{ lng: point.lng, lat: point.lat }}
      zoom={point.approx ? 13.5 : 15}
      label={label}
      className="h-[320px] rounded-[20px] md:h-[380px]"
      onReady={(map, maplibre) => {
        // The brand's accent colour (Settings -> Branding), not a fixed one.
        const accent =
          getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() ||
          "#a9502f";
        if (point.approx) {
          map.addSource("area", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Polygon",
                coordinates: [circle(point.lng, point.lat, point.radiusM)],
              },
            },
          });
          map.addLayer({
            id: "area-fill",
            type: "fill",
            source: "area",
            paint: { "fill-color": accent, "fill-opacity": 0.14 },
          });
          map.addLayer({
            id: "area-line",
            type: "line",
            source: "area",
            paint: { "line-color": accent, "line-width": 2 },
          });
          return;
        }
        const el = document.createElement("div");
        el.className =
          "size-5 rounded-full border-[3px] border-white bg-[var(--color-accent)] shadow-pin";
        new maplibre.Marker({ element: el }).setLngLat([point.lng, point.lat]).addTo(map);
      }}
    />
  );
}
