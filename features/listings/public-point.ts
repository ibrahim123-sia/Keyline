import type { LngLat } from "@/lib/geo";

/**
 * Where the public may see a listing on a map (05 §5 `map_pin_exact`, 06 §4.5): the exact pin,
 * or an approximate area. For the approximate case the point is snapped to a ~500 m grid and
 * moved by a fixed offset per listing (the same approach as search pins), so the building
 * cannot be read off the page and nearby listings do not stack. Run it on the server only: the
 * exact point must never be sent to a browser.
 */
export type PublicPoint = {
  lng: number;
  lat: number;
  /** True: draw an area of `radiusM`, not a pin. */
  approx: boolean;
  radiusM: number;
};

/**
 * Radius of the approximate area. Snapping moves a point up to 0.0025° and the offset up to
 * 0.002° on each axis, at most about 710 m in all, so 800 m always contains the listing.
 */
export const APPROX_RADIUS_M = 800;

function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function publicPoint(id: string, point: LngLat, exact: boolean): PublicPoint {
  if (exact) return { lng: point.lng, lat: point.lat, approx: false, radiusM: 0 };
  const h = hash(id);
  const dx = ((h % 1000) / 1000 - 0.5) * 0.004;
  const dy = (((h >>> 10) % 1000) / 1000 - 0.5) * 0.004;
  const snap = (v: number) => Math.round(v / 0.005) * 0.005;
  return {
    lng: Number((snap(point.lng) + dx).toFixed(5)),
    lat: Number((snap(point.lat) + dy).toFixed(5)),
    approx: true,
    radiusM: APPROX_RADIUS_M,
  };
}
