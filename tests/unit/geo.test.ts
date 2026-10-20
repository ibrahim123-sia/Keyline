import { describe, expect, it } from "vitest";
import {
  closeRing,
  haversineMeters,
  isValidLngLat,
  parseEwkbPoint,
  parseEwkbPolygon,
  pointToEwkt,
  polygonToEwkt,
} from "@/lib/geo";

// EWKB hex produced by PostGIS: SELECT ST_SetSRID(ST_MakePoint(55.14, 25.08), 4326)
const POINT_HEX = "0101000020E610000052B81E85EB914B4014AE47E17A143940";
// SELECT ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((0 0,1 0,1 1,0 0)),((5 5,6 5,6 6,5 5)))'), 4326)
const MULTI_HEX =
  "0106000020E6100000020000000103000000010000000400000000000000000000000000000000000000000000000000F03F0000000000000000000000000000F03F000000000000F03F000000000000000000000000000000000103000000010000000400000000000000000014400000000000001440000000000000184000000000000014400000000000001840000000000000184000000000000014400000000000001440";

function polygonHex(rings: Array<Array<[number, number]>>, srid = 4326): string {
  const parts: number[] = [];
  const pushU32 = (v: number) => {
    const b = new DataView(new ArrayBuffer(4));
    b.setUint32(0, v, true);
    parts.push(...new Uint8Array(b.buffer));
  };
  const pushF64 = (v: number) => {
    const b = new DataView(new ArrayBuffer(8));
    b.setFloat64(0, v, true);
    parts.push(...new Uint8Array(b.buffer));
  };
  parts.push(1);
  pushU32(3 | 0x20000000);
  pushU32(srid);
  pushU32(rings.length);
  for (const ring of rings) {
    pushU32(ring.length);
    for (const [x, y] of ring) {
      pushF64(x);
      pushF64(y);
    }
  }
  return parts.map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("geo helpers", () => {
  it("parses a PostGIS EWKB point", () => {
    const p = parseEwkbPoint(POINT_HEX);
    expect(p.lng).toBeCloseTo(55.14, 10);
    expect(p.lat).toBeCloseTo(25.08, 10);
  });

  it("parses an EWKB polygon to GeoJSON", () => {
    const ring: Array<[number, number]> = [
      [55.1, 25.0],
      [55.2, 25.0],
      [55.2, 25.1],
      [55.1, 25.0],
    ];
    const g = parseEwkbPolygon(polygonHex([ring]));
    expect(g).toEqual({ type: "Polygon", coordinates: [ring] });
  });

  it("parses an EWKB multipolygon", () => {
    const g = parseEwkbPolygon(MULTI_HEX);
    expect(g.type).toBe("MultiPolygon");
    expect(g.coordinates).toEqual([
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
      [
        [
          [5, 5],
          [6, 5],
          [6, 6],
          [5, 5],
        ],
      ],
    ]);
  });

  it("writes EWKT with SRID 4326 and closes rings", () => {
    expect(pointToEwkt({ lng: 55.14, lat: 25.08 })).toBe("SRID=4326;POINT(55.14 25.08)");
    expect(
      polygonToEwkt({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
        ],
      }),
    ).toBe("SRID=4326;POLYGON((0 0,1 0,1 1,0 0))");
    expect(closeRing([[1, 2]])).toEqual([[1, 2]]);
  });

  it("measures great-circle distance in metres", () => {
    // Dubai Mall to Burj Al Arab: about 11.5 km in a straight line.
    const d = haversineMeters({ lng: 55.2796, lat: 25.1972 }, { lng: 55.1853, lat: 25.1412 });
    expect(d).toBeGreaterThan(11_000);
    expect(d).toBeLessThan(12_000);
    expect(haversineMeters({ lng: 1, lat: 1 }, { lng: 1, lat: 1 })).toBe(0);
  });

  it("validates coordinates", () => {
    expect(isValidLngLat({ lng: 55, lat: 25 })).toBe(true);
    expect(isValidLngLat({ lng: 181, lat: 0 })).toBe(false);
    expect(isValidLngLat({ lng: 0, lat: Number.NaN })).toBe(false);
  });
});
