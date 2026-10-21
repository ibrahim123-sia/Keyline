import { describe, expect, it } from "vitest";
import { parseSection, sectionInputSchema } from "@/features/cms/sections";

describe("page sections", () => {
  it("fills style defaults and keeps valid props", () => {
    expect(
      parseSection({
        id: "hero",
        type: "hero_search",
        props: { heading: "Find a home", tabs: ["buy", "rent"] },
      }),
    ).toEqual({
      id: "hero",
      type: "hero_search",
      props: {
        eyebrow: "",
        heading: "Find a home",
        subheading: "",
        tabs: ["buy", "rent"],
        defaultTab: "buy",
        imageId: null,
        floatingBadge: true,
        floatingBadgeText: "",
      },
      style: {
        background: "white",
        backgroundImageId: null,
        spacing: "normal",
        width: "contained",
        anchor: "",
        hideOn: "none",
      },
    });
  });

  it("skips unknown or broken sections instead of failing the page", () => {
    expect(parseSection({ id: "x", type: "marquee", props: {} })).toBeNull();
    expect(parseSection({ id: "x", type: "promise_strip", props: { items: [] } })).toBeNull();
    expect(
      parseSection({
        id: "x",
        type: "cta",
        props: { buttons: [{ label: "Go", href: "javascript:alert(1)" }] },
      }),
    ).toBeNull();
    expect(parseSection({ type: "cta", props: {} })).toBeNull();
    expect(parseSection("nope")).toBeNull();
  });

  it("saving is strict: unknown keys are refused", () => {
    const schema = sectionInputSchema();
    expect(
      schema.safeParse({ id: "a", type: "cta", props: { heading: "Sell with us", script: "x" } })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({
        id: "a",
        type: "cta",
        props: {
          heading: "Sell with us",
          buttons: [{ label: "Value my home", href: "/valuation" }],
        },
      }).success,
    ).toBe(true);
  });
});
