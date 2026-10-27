/**
 * Map tiles (13 §1 "Map tiles"): the agency's style URL or MapTiler key from Settings ->
 * Integrations, else a keyless fallback so maps always work (OpenFreeMap, no account needed).
 */
export const FALLBACK_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export type MapStyleConfig = { styleUrl: string; attribution?: string };

export function resolveMapStyle(input: {
  tileStyleUrl?: string;
  tileKey?: string;
}): MapStyleConfig {
  if (input.tileStyleUrl) {
    const url =
      input.tileKey && !input.tileStyleUrl.includes("key=")
        ? `${input.tileStyleUrl}${input.tileStyleUrl.includes("?") ? "&" : "?"}key=${encodeURIComponent(input.tileKey)}`
        : input.tileStyleUrl;
    return { styleUrl: url };
  }
  if (input.tileKey) {
    return {
      styleUrl: `https://api.maptiler.com/maps/dataviz-light/style.json?key=${encodeURIComponent(input.tileKey)}`,
    };
  }
  return { styleUrl: FALLBACK_STYLE_URL };
}
