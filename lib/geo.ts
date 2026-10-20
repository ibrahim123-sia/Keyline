/**
 * Small geometry helpers shared by the database layer and the UI.
 * Coordinates are always WGS84 (SRID 4326), longitude first, like GeoJSON.
 */

export type LngLat = { lng: number; lat: number };
export type Position = [number, number];
export type PolygonCoords = Position[][];
export type GeoPolygon =
  | { type: "Polygon"; coordinates: PolygonCoords }
  | { type: "MultiPolygon"; coordinates: PolygonCoords[] };

export function isValidLngLat(p: LngLat): boolean {
  return (
    Number.isFinite(p.lng) &&
    Number.isFinite(p.lat) &&
    p.lng >= -180 &&
    p.lng <= 180 &&
    p.lat >= -90 &&
    p.lat <= 90
  );
}

/** Great-circle distance in metres (haversine). Used for straight-line fallbacks. */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const R = 6_371_008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(s))));
}

const fmt = (n: number) => Number(n.toFixed(7)).toString();

export function pointToEwkt(p: LngLat): string {
  return `SRID=4326;POINT(${fmt(p.lng)} ${fmt(p.lat)})`;
}

function ringToWkt(ring: Position[]): string {
  const closed = closeRing(ring);
  return `(${closed.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(",")})`;
}

export function closeRing(ring: Position[]): Position[] {
  if (ring.length === 0) return ring;
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

export function polygonToEwkt(g: GeoPolygon): string {
  if (g.type === "Polygon") {
    return `SRID=4326;POLYGON(${g.coordinates.map(ringToWkt).join(",")})`;
  }
  return `SRID=4326;MULTIPOLYGON(${g.coordinates
    .map((poly) => `(${poly.map(ringToWkt).join(",")})`)
    .join(",")})`;
}

/* ----------------------------- EWKB parsing ------------------------------ */

const WKB_POINT = 1;
const WKB_POLYGON = 3;
const WKB_MULTIPOLYGON = 6;
const EWKB_SRID_FLAG = 0x20000000;

class WkbReader {
  private offset = 0;
  private little = true;
  private readonly view: DataView;

  constructor(hex: string) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    this.view = new DataView(bytes.buffer);
  }

  header(): number {
    this.little = this.view.getUint8(this.offset) === 1;
    this.offset += 1;
    const type = this.view.getUint32(this.offset, this.little);
    this.offset += 4;
    if (type & EWKB_SRID_FLAG) this.offset += 4; // skip SRID, always 4326 here
    return type & 0xffff;
  }

  uint32(): number {
    const v = this.view.getUint32(this.offset, this.little);
    this.offset += 4;
    return v;
  }

  float64(): number {
    const v = this.view.getFloat64(this.offset, this.little);
    this.offset += 8;
    return v;
  }

  position(): Position {
    return [this.float64(), this.float64()];
  }

  polygonBody(): PolygonCoords {
    const rings = this.uint32();
    const out: PolygonCoords = [];
    for (let r = 0; r < rings; r++) {
      const n = this.uint32();
      const ring: Position[] = [];
      for (let i = 0; i < n; i++) ring.push(this.position());
      out.push(ring);
    }
    return out;
  }
}

export function parseEwkbPoint(hex: string): LngLat {
  const r = new WkbReader(hex);
  const type = r.header();
  if (type !== WKB_POINT) throw new Error(`Expected a point, got WKB type ${type}`);
  const [lng, lat] = r.position();
  return { lng, lat };
}

export function parseEwkbPolygon(hex: string): GeoPolygon {
  const r = new WkbReader(hex);
  const type = r.header();
  if (type === WKB_POLYGON) return { type: "Polygon", coordinates: r.polygonBody() };
  if (type === WKB_MULTIPOLYGON) {
    const count = r.uint32();
    const polys: PolygonCoords[] = [];
    for (let i = 0; i < count; i++) {
      r.header();
      polys.push(r.polygonBody());
    }
    return { type: "MultiPolygon", coordinates: polys };
  }
  throw new Error(`Expected a polygon, got WKB type ${type}`);
}
