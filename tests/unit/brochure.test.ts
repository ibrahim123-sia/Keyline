import { describe, expect, it } from "vitest";
import { locationPlotSvg, ringStep } from "@/features/brochure/plot";
import { fontsHref } from "@/features/brochure/template";

describe("brochure template parts (11 §4)", () => {
  it("asks Google Fonts only for weights each font has", () => {
    expect(fontsHref("DM Serif Display", "Manrope")).toBe(
      "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Manrope:wght@400;500;600;700&display=block",
    );
    expect(fontsHref("Fraunces", "Inter")).toContain("family=Fraunces:wght@400;500");
  });

  it("draws two to four distance rings in the market's unit", () => {
    expect(ringStep(1300, "km")).toBe(500);
    expect(ringStep(350, "km")).toBe(100);
    expect(ringStep(3000, "mi")).toBeCloseTo(0.5 * 1609.344);
  });

  it("plots numbered places around the pin, an area circle when the pin is private", () => {
    const center = { lng: 55.14, lat: 25.08, approx: false, radiusM: 0 };
    const colors = {
      ink: "#111111",
      accent: "#A9502F",
      accentSoft: "#F3E6DF",
      border: "#E6DED3",
      muted: "#5B6670",
    };
    const svg = locationPlotSvg({
      center,
      places: [
        { n: 1, point: { lng: 55.14, lat: 25.085 } },
        { n: 2, point: { lng: 55.145, lat: 25.08 } },
      ],
      distanceUnit: "km",
      northLabel: "N",
      colors,
      fontFamily: "Manrope",
    });
    expect(svg.match(/<g><circle/g)).toHaveLength(2);
    expect(svg).toContain(">1</text>");
    expect(svg).toContain('fill="#A9502F"');
    const approx = locationPlotSvg({
      center: { ...center, approx: true, radiusM: 800 },
      places: [],
      distanceUnit: "km",
      northLabel: "N",
      colors,
      fontFamily: "Manrope",
    });
    expect(approx).toContain('fill="#F3E6DF"');
  });
});
