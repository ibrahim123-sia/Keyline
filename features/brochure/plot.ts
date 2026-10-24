import type { LngLat } from "@/lib/geo";
import { formatDistance, type DistanceUnit } from "@/lib/units";

/**
 * The brochure's location picture (11 §4 page 4): an SVG plot of the home and its numbered
 * nearby places, to scale, with distance rings. Chosen over a map image because the site's
 * tiles are vector tiles (OpenFreeMap or a MapTiler style), so a picture would need either
 * WebGL in the headless browser (slow and fragile, and the tiles must all arrive before the
 * PDF is cut) or a separate static-maps service whose browser key is locked to the site's
 * address. This needs no network, prints sharply and uses the branding colours. Pure.
 */

export type PlotPoint = { n: number; point: LngLat };

export type PlotInput = {
  center: LngLat & { approx: boolean; radiusM: number };
  places: PlotPoint[];
  distanceUnit: DistanceUnit;
  northLabel: string;
  colors: { ink: string; accent: string; accentSoft: string; border: string; muted: string };
  fontFamily: string;
};

const SIZE = 600;
const MID = SIZE / 2;
const RADIUS = 262;
const DOT = 14;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Metres east and north of the centre (equirectangular: fine within a few kilometres). */
export function offsetMetres(center: LngLat, p: LngLat): { x: number; y: number } {
  const x = (p.lng - center.lng) * Math.cos((center.lat * Math.PI) / 180) * 111_320;
  const y = (p.lat - center.lat) * 110_574;
  return { x, y };
}

const MI = 1609.344;

/** A round ring spacing giving two to four rings inside `extent` metres. */
export function ringStep(extent: number, unit: DistanceUnit): number {
  const steps =
    unit === "mi"
      ? [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50].map((m) => m * MI)
      : [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10_000, 20_000, 50_000];
  return steps.find((s) => extent / s <= 4) ?? steps.at(-1)!;
}

export function locationPlotSvg(input: PlotInput): string {
  const { center, colors } = input;
  const offsets = input.places.map((p) => ({ n: p.n, ...offsetMetres(center, p.point) }));
  const farthest = Math.max(
    300,
    center.approx ? center.radiusM : 0,
    ...offsets.map((o) => Math.hypot(o.x, o.y)),
  );
  const extent = farthest * 1.1;
  const scale = RADIUS / extent;
  const step = ringStep(extent, input.distanceUnit);

  // Positions in pixels, kept inside the plot; dots that would overlap are pushed apart.
  const dots = offsets.map((o) => {
    let px = o.x * scale;
    let py = -o.y * scale;
    const r = Math.hypot(px, py);
    const max = RADIUS - DOT;
    if (r > max) {
      px = (px / r) * max;
      py = (py / r) * max;
    }
    return { n: o.n, x: MID + px, y: MID + py };
  });
  for (let round = 0; round < 6; round++)
    for (let i = 0; i < dots.length; i++)
      for (let j = i + 1; j < dots.length; j++) {
        const a = dots[i]!;
        const b = dots[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = DOT * 2 + 2;
        if (d >= min) continue;
        const ux = d === 0 ? 1 : dx / d;
        const uy = d === 0 ? 0 : dy / d;
        const push = (min - d) / 2;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
      }

  const rings: string[] = [];
  for (let m = step, i = 0; m <= extent && i < 6; m += step, i++) {
    const r = m * scale;
    rings.push(
      `<circle cx="${MID}" cy="${MID}" r="${r.toFixed(1)}" fill="none" stroke="${colors.border}" stroke-width="2" stroke-dasharray="6 6"/>`,
      `<text x="${MID}" y="${(MID - r - 6).toFixed(1)}" text-anchor="middle" font-size="17" fill="${colors.muted}">${esc(formatDistance(m, input.distanceUnit))}</text>`,
    );
  }

  const home = center.approx
    ? `<circle cx="${MID}" cy="${MID}" r="${Math.max(18, center.radiusM * scale).toFixed(1)}" fill="${colors.accentSoft}" fill-opacity="0.85" stroke="${colors.accent}" stroke-width="3"/>` +
      `<circle cx="${MID}" cy="${MID}" r="7" fill="${colors.accent}"/>`
    : `<circle cx="${MID}" cy="${MID}" r="20" fill="${colors.accent}" stroke="#FFFFFF" stroke-width="5"/>` +
      `<circle cx="${MID}" cy="${MID}" r="6" fill="#FFFFFF"/>`;

  const places = dots
    .map(
      (d) =>
        `<g><circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${DOT}" fill="${colors.ink}" stroke="#FFFFFF" stroke-width="3"/>` +
        `<text x="${d.x.toFixed(1)}" y="${(d.y + 6).toFixed(1)}" text-anchor="middle" font-size="16" font-weight="700" fill="#FFFFFF">${d.n}</text></g>`,
    )
    .join("");

  const north =
    `<g transform="translate(${SIZE - 46} 46)">` +
    `<path d="M0 -22 L10 8 L0 2 L-10 8 Z" fill="${colors.ink}"/>` +
    `<text x="0" y="28" text-anchor="middle" font-size="17" font-weight="700" fill="${colors.ink}">${esc(input.northLabel)}</text></g>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" role="img" font-family="${esc(input.fontFamily)}">` +
    `<circle cx="${MID}" cy="${MID}" r="${RADIUS + 18}" fill="#FFFFFF" stroke="${colors.border}" stroke-width="2"/>` +
    `<line x1="${MID}" y1="${MID - RADIUS}" x2="${MID}" y2="${MID + RADIUS}" stroke="${colors.border}" stroke-width="1.5"/>` +
    `<line x1="${MID - RADIUS}" y1="${MID}" x2="${MID + RADIUS}" y2="${MID}" stroke="${colors.border}" stroke-width="1.5"/>` +
    rings.join("") +
    home +
    places +
    north +
    `</svg>`
  );
}
