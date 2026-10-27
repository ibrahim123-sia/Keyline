/**
 * SVG uploads (admins only; 14 §2 forbids them from the public). An SVG is XML that can carry
 * scripts and external references, so anything active is refused outright rather than
 * "cleaned", and /media serves SVG with a sandboxing CSP as a second line of defence.
 */

const decoder = new TextDecoder("utf-8", { fatal: false });

/** Leading XML prolog: BOM, whitespace, <?xml?>, comments and a simple DOCTYPE. */
function skipProlog(text: string): string {
  let t = text.replace(/^﻿/, "");
  for (;;) {
    const before = t;
    t = t.replace(/^\s+/, "");
    t = t.replace(/^<\?xml[\s\S]*?\?>/, "");
    t = t.replace(/^<!--[\s\S]*?-->/, "");
    t = t.replace(/^<!DOCTYPE[^>[]*>/i, "");
    if (t === before) return t;
  }
}

export function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = skipProlog(decoder.decode(bytes.subarray(0, 4096)));
  return /^<svg[\s>]/.test(head);
}

const blocked: Array<[RegExp, string]> = [
  [/<!ENTITY/i, "entity declarations"],
  [/<!DOCTYPE[^>]*\[/i, "an internal DTD"],
  [/<script[\s>/]/i, "scripts"],
  [/\son[a-z]+\s*=/i, "event handlers"],
  [/<foreignObject[\s>/]/i, "embedded HTML"],
  [/<(iframe|embed|object|audio|video|animate|set|handler|listener)[\s>/]/i, "active elements"],
  [/(?:href|src)\s*=\s*["']?\s*(?:javascript|vbscript|data:text\/html)/i, "script links"],
  [/(?:href|src)\s*=\s*["']?\s*(?:https?:)?\/\//i, "links to other sites"],
  [/url\(\s*["']?\s*(?:https?:)?\/\//i, "external styles"],
  [/@import/i, "style imports"],
];

/** Null when the SVG is a plain drawing; otherwise a reason to show the admin. */
export function svgProblem(bytes: Uint8Array): string | null {
  const text = decoder.decode(bytes);
  for (const [pattern, what] of blocked) {
    if (pattern.test(text)) {
      return `This SVG contains ${what}, which are not allowed. Export a plain SVG, or upload a PNG.`;
    }
  }
  return null;
}

function length(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/.exec(value);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Intrinsic size from width/height, else from the viewBox (for the aspect ratio). */
export function svgDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const head = skipProlog(decoder.decode(bytes.subarray(0, 8192)));
  const tag = /^<svg\b([^>]*)>/.exec(head)?.[1] ?? "";
  const attr = (name: string) =>
    new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
  const w = length(attr("width"));
  const h = length(attr("height"));
  if (w && h) return { width: Math.round(w), height: Math.round(h) };
  const box = attr("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (box && box.length === 4 && box[2]! > 0 && box[3]! > 0) {
    return { width: Math.round(box[2]!), height: Math.round(box[3]!) };
  }
  return null;
}
