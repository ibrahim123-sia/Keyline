import type { BrandingSettings, ColorToken } from "@/features/settings/schema";
import { checkPairs, readableOn, type ContrastPair, type ContrastResult } from "@/lib/contrast";
import { fontCssVar } from "@/lib/font-vars";

/** Settings key -> CSS custom property (02-design-system.md §2 names). */
export const colorCssVar: Record<ColorToken, string> = {
  bg: "--color-bg",
  surface: "--color-surface",
  surfaceSoft: "--color-surface-soft",
  surfaceMuted: "--color-surface-muted",
  ink: "--color-ink",
  inkSoft: "--color-ink-soft",
  text: "--color-text",
  textMuted: "--color-text-muted",
  border: "--color-border",
  accent: "--color-accent",
  accentSoft: "--color-accent-soft",
  success: "--color-success",
  successSoft: "--color-success-soft",
  danger: "--color-danger",
  photoPlaceholder: "--color-photo-placeholder",
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * CSS injected in the root layout. Values come from validated settings (hex colours and
 * font names from a fixed list), and are re-checked here so nothing else can reach the page.
 */
export function brandingCss(branding: BrandingSettings): string {
  const decls: string[] = [];
  for (const [key, cssVar] of Object.entries(colorCssVar) as Array<[ColorToken, string]>) {
    const value = branding.colors[key];
    if (HEX.test(value)) decls.push(`${cssVar}:${value}`);
  }
  if (HEX.test(branding.colors.accent)) {
    decls.push(`--color-on-accent:${readableOn(branding.colors.accent)}`);
  }
  const display = fontCssVar[branding.fontDisplay];
  const body = fontCssVar[branding.fontBody];
  if (display) decls.push(`--font-display:var(${display}),Georgia,serif`);
  if (body) decls.push(`--font-body:var(${body}),ui-sans-serif,system-ui,sans-serif`);
  decls.push(`--radius:${branding.cornerStyle === "sharp" ? "6px" : "12px"}`);
  return `html:root{${decls.join(";")}}`;
}

/** The text/background pairs the public site actually uses, for the branding editor. */
export function brandingContrastPairs(colors: BrandingSettings["colors"]): ContrastPair[] {
  return [
    {
      label: "Body text on page background",
      foreground: colors.text,
      background: colors.bg,
      minimum: 4.5,
    },
    {
      label: "Body text on cards",
      foreground: colors.text,
      background: colors.surface,
      minimum: 4.5,
    },
    {
      label: "Headings on page background",
      foreground: colors.ink,
      background: colors.bg,
      minimum: 4.5,
    },
    {
      label: "Labels and captions on cards",
      foreground: colors.textMuted,
      background: colors.surface,
      minimum: 4.5,
    },
    {
      label: "Labels on soft bands",
      foreground: colors.textMuted,
      background: colors.surfaceSoft,
      minimum: 4.5,
    },
    {
      label: "Text on CTA blocks and chips",
      foreground: colors.ink,
      background: colors.surfaceMuted,
      minimum: 4.5,
    },
    {
      label: "Button text on accent",
      foreground: readableOn(colors.accent),
      background: colors.accent,
      minimum: 4.5,
    },
    {
      label: "Accent links on cards",
      foreground: colors.accent,
      background: colors.surface,
      minimum: 4.5,
    },
    {
      label: "Text on dark sections",
      foreground: colors.surface,
      background: colors.ink,
      minimum: 4.5,
    },
    {
      label: "Text on dark cards",
      foreground: colors.surface,
      background: colors.inkSoft,
      minimum: 4.5,
    },
    {
      label: "Verified badge",
      foreground: colors.success,
      background: colors.successSoft,
      minimum: 4.5,
    },
    // Accent on its soft tint is ~4.4:1 with Desert Modern: fine for icons (UI graphics, 3:1),
    // so badge text on that tint uses ink instead (see PROGRESS.md decisions).
    {
      label: "Accent icons on accent tiles",
      foreground: colors.accent,
      background: colors.accentSoft,
      minimum: 3,
    },
    {
      label: "Badge text on accent tiles",
      foreground: colors.ink,
      background: colors.accentSoft,
      minimum: 4.5,
    },
    {
      label: "Error text on cards",
      foreground: colors.danger,
      background: colors.surface,
      minimum: 4.5,
    },
  ];
}

export function brandingContrastReport(colors: BrandingSettings["colors"]): ContrastResult[] {
  return checkPairs(brandingContrastPairs(colors));
}
