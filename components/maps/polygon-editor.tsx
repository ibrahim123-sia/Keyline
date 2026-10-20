"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { EraserIcon, PencilLineIcon, SplineIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type * as TerraDrawLib from "terra-draw";
import type { TerraDraw } from "terra-draw";
import { Button } from "@/components/ui/button";
import type { GeoPolygon, PolygonCoords } from "@/lib/geo";
import { BaseMap, type LngLat } from "./base-map";

type DrawLib = typeof TerraDrawLib;

/** All drawn polygons -> one Polygon or a MultiPolygon. */
export function featuresToGeometry(
  features: Array<{ geometry: { type: string; coordinates: unknown } }>,
): GeoPolygon | null {
  const polys = features
    .filter((f) => f.geometry.type === "Polygon")
    .map((f) => f.geometry.coordinates as PolygonCoords);
  if (polys.length === 0) return null;
  return polys.length === 1
    ? { type: "Polygon", coordinates: polys[0]! }
    : { type: "MultiPolygon", coordinates: polys };
}

/**
 * Boundary / search-area drawing (07 §1 locations, 11 §8 draw your area): click-by-click or
 * freehand polygons, editable afterwards. Works with touch; "Clear" is a real button.
 */
export function PolygonEditor({
  value,
  onChange,
  styleUrl,
  center,
  zoom = 12,
  className = "h-96",
}: {
  value: GeoPolygon | null;
  onChange: (g: GeoPolygon | null) => void;
  styleUrl: string;
  center: LngLat;
  zoom?: number;
  className?: string;
}) {
  const drawRef = useRef<TerraDraw | null>(null);
  const onChangeRef = useRef(onChange);
  const [mode, setMode] = useState<"select" | "polygon" | "freehand">("select");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => () => drawRef.current?.stop(), []);

  function emit() {
    const draw = drawRef.current;
    if (!draw) return;
    onChangeRef.current(featuresToGeometry(draw.getSnapshot() as never));
  }

  async function init(map: MapLibreMap) {
    const [draw, { TerraDrawMapLibreGLAdapter }] = await Promise.all([
      import("terra-draw") as Promise<DrawLib>,
      import("terra-draw-maplibre-gl-adapter"),
    ]);
    const accent = "#A9502F";
    const instance = new draw.TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [
        new draw.TerraDrawSelectMode({
          flags: {
            polygon: {
              feature: {
                draggable: true,
                coordinates: { midpoints: true, draggable: true, deletable: true },
              },
            },
          },
        }),
        new draw.TerraDrawPolygonMode({
          styles: { fillColor: accent, fillOpacity: 0.15, outlineColor: accent, outlineWidth: 2 },
        }),
        new draw.TerraDrawFreehandMode({
          styles: { fillColor: accent, fillOpacity: 0.15, outlineColor: accent, outlineWidth: 2 },
        }),
      ],
    });
    instance.start();
    if (value) {
      const polys = value.type === "Polygon" ? [value.coordinates] : value.coordinates;
      instance.addFeatures(
        polys.map((coordinates) => ({
          type: "Feature",
          geometry: { type: "Polygon", coordinates },
          properties: { mode: "polygon" },
        })) as never,
      );
    }
    instance.setMode("select");
    instance.on("finish", () => {
      emit();
      instance.setMode("select");
      setMode("select");
    });
    instance.on("change", (_ids, type) => {
      if (type === "update" || type === "delete") emit();
    });
    drawRef.current = instance;
    setReady(true);
  }

  function choose(next: "polygon" | "freehand") {
    drawRef.current?.setMode(next);
    setMode(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Drawing tools">
        <Button
          type="button"
          size="sm"
          variant={mode === "polygon" ? "default" : "outline"}
          disabled={!ready}
          onClick={() => choose("polygon")}
        >
          <SplineIcon /> Draw shape
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "freehand" ? "default" : "outline"}
          disabled={!ready}
          onClick={() => choose("freehand")}
        >
          <PencilLineIcon /> Freehand
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!ready || !value}
          onClick={() => {
            drawRef.current?.clear();
            drawRef.current?.setMode("select");
            setMode("select");
            onChange(null);
          }}
        >
          <EraserIcon /> Clear drawing
        </Button>
      </div>
      <p className="text-[12.5px] text-text-muted">
        {mode === "polygon"
          ? "Click to add corners; click the first corner to finish."
          : mode === "freehand"
            ? "Press and drag to draw; release to finish."
            : value
              ? "Drag corners to adjust the shape."
              : "Choose a tool to draw the boundary."}
      </p>
      <BaseMap
        styleUrl={styleUrl}
        center={center}
        zoom={zoom}
        lazy={false}
        className={`${className} rounded-md border border-border`}
        label="Map: draw the area boundary"
        onReady={(map) => void init(map)}
      />
    </div>
  );
}
