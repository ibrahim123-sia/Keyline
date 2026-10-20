/**
 * WCAG 2.x contrast helpers. Text must reach 4.5:1 (3:1 for large text and UI parts);
 * the branding editor warns when a chosen colour fails (02 §2, 14 §4).
 */

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** White or near-black, whichever reads better on the given background. */
export function readableOn(background: string, light = "#FFFFFF", dark = "#14232B"): string {
  return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark;
}

export type ContrastPair = {
  label: string;
  foreground: string;
  background: string;
  /** 4.5 for body text, 3 for large text and UI parts. */
  minimum: number;
};

export type ContrastResult = ContrastPair & { ratio: number; passes: boolean };

export function checkPairs(pairs: ContrastPair[]): ContrastResult[] {
  return pairs.map((p) => {
    const ratio = contrastRatio(p.foreground, p.background);
    return { ...p, ratio, passes: ratio >= p.minimum };
  });
}
