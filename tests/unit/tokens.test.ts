import { describe, expect, it } from "vitest";
import { defaultsFor, desertModernColors } from "@/features/settings/schema";
import { contrastRatio, readableOn, relativeLuminance } from "@/lib/contrast";
import { brandingContrastReport, brandingCss } from "@/lib/tokens";

describe("contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBe(21);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBe(1);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
    // #767676 on white is the classic 4.54:1 grey.
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
  });

  it("picks readable text for a background", () => {
    expect(readableOn("#A9502F")).toBe("#FFFFFF");
    expect(readableOn("#F3E6DF")).toBe("#14232B");
  });

  it("Desert Modern passes every text pair it uses", () => {
    const failing = brandingContrastReport(desertModernColors).filter((r) => !r.passes);
    expect(failing).toEqual([]);
  });

  it("flags a colour that fails", () => {
    const report = brandingContrastReport({ ...desertModernColors, text: "#C8C2BA" });
    expect(report.some((r) => !r.passes && r.label.startsWith("Body text"))).toBe(true);
  });
});

describe("brandingCss", () => {
  it("emits every token, the text-on-accent colour, fonts and radius", () => {
    const css = brandingCss(defaultsFor("branding"));
    expect(css.startsWith("html:root{")).toBe(true);
    expect(css).toContain("--color-bg:#F7F3EE");
    expect(css).toContain("--color-accent:#A9502F");
    expect(css).toContain("--color-on-accent:#FFFFFF");
    expect(css).toContain("--font-display:var(--font-fraunces)");
    expect(css).toContain("--font-body:var(--font-manrope)");
    expect(css).toContain("--radius:12px");
  });

  it("never emits a value that is not a hex colour", () => {
    const branding = defaultsFor("branding");
    const css = brandingCss({
      ...branding,
      colors: { ...branding.colors, bg: "red;}</style><script>alert(1)</script>" },
      cornerStyle: "sharp",
    });
    expect(css).not.toContain("script");
    expect(css).not.toContain("--color-bg");
    expect(css).toContain("--radius:6px");
  });
});
