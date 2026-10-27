import type { bodyFonts, displayFonts } from "@/features/settings/schema";

/**
 * Font name (Settings -> Branding) -> CSS variable registered by its next/font loader in
 * lib/fonts.ts. Kept separate so code outside the Next compiler (tests) can use it.
 */
export type FontName = (typeof displayFonts)[number] | (typeof bodyFonts)[number];

/** CSS variable each font registers (the `variable` option of its loader). */
export const fontCssVar: Record<FontName, string> = {
  Fraunces: "--font-fraunces",
  "Playfair Display": "--font-playfair",
  "Cormorant Garamond": "--font-cormorant",
  "DM Serif Display": "--font-dm-serif",
  Lora: "--font-lora",
  "Libre Baskerville": "--font-baskerville",
  Manrope: "--font-manrope",
  Inter: "--font-inter",
  "DM Sans": "--font-dm-sans",
  "Plus Jakarta Sans": "--font-jakarta",
  "Work Sans": "--font-work-sans",
  "Nunito Sans": "--font-nunito-sans",
};
