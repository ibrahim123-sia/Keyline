import { describe, expect, it } from "vitest";
import { toSiteLinks } from "@/features/menus/queries";
import { menuInputSchema, parseStoredItems, targetProblem } from "@/features/menus/schema";

const PAGE = "0192f000-0000-7000-8000-00000000a001";
const AREA = "0192f000-0000-7000-8000-00000000a002";

const link = (patch: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  label: "About us",
  type: "page",
  target: PAGE,
  openInNewTab: false,
  ...patch,
});

describe("menu schema", () => {
  it("accepts a header with one level of dropdown links", () => {
    const res = menuInputSchema.safeParse({
      location: "header",
      items: [
        link({
          label: "Buy",
          type: "search",
          target: "/buy",
          children: [link({ type: "area", target: AREA, label: "Old Harbour" })],
        }),
        link({ label: "Rent", type: "search", target: "/rent/old-harbour?beds=2&sort=newest" }),
        link({ label: "Call us", type: "url", target: "tel:+971 4 123 4567" }),
      ],
    });
    expect(res.success).toBe(true);
    expect(res.data?.items[0]?.children).toHaveLength(1);
    expect(res.data?.items[1]?.children).toEqual([]);
  });

  it("keeps footer columns flat", () => {
    const res = menuInputSchema.safeParse({
      location: "footer_1",
      title: "Explore",
      items: [link({ children: [link()] })],
    });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.path).toEqual(["items", 0, "children"]);
  });

  it("refuses unsafe or malformed targets", () => {
    expect(targetProblem("url", "javascript:alert(1)")).toBeTruthy();
    expect(targetProblem("url", "//evil.example/path")).toBeTruthy();
    expect(targetProblem("url", "data:text/html,hi")).toBeTruthy();
    expect(targetProblem("url", "/about")).toBeNull();
    expect(targetProblem("url", "https://example.com/a?b=c")).toBeNull();
    expect(targetProblem("url", "mailto:hello@example.com")).toBeNull();
    expect(targetProblem("search", "/buy/old-harbour/villa?beds=3")).toBeNull();
    expect(targetProblem("search", "/projects")).toBeTruthy();
    expect(targetProblem("search", "/buy/<script>")).toBeTruthy();
    expect(targetProblem("page", "not-an-id")).toBeTruthy();
    expect(targetProblem("page", PAGE)).toBeNull();
  });

  it("needs labels and unique link ids", () => {
    const same = link();
    const res = menuInputSchema.safeParse({
      location: "header",
      items: [link({ label: "  " }), same, { ...same }],
    });
    expect(res.success).toBe(false);
    const paths = res.error!.issues.map((i) => i.path.join("."));
    expect(paths).toContain("items.0.label");
    expect(paths).toContain("items.2.id");
  });

  it("reads stored items leniently", () => {
    const stored = [
      link({ children: [link()] }),
      { label: "broken" },
      link({ type: "url", target: "javascript:x" }),
    ];
    expect(parseStoredItems(stored, "header")).toHaveLength(1);
    expect(parseStoredItems(stored, "footer_2")[0]?.children).toEqual([]);
    expect(parseStoredItems("nope", "header")).toEqual([]);
  });

  it("turns items into site links, leaving out links whose target is gone", () => {
    const items = parseStoredItems(
      [
        link({ label: "About", children: [link({ label: "Team", type: "url", target: "/team" })] }),
        link({ label: "Gone", target: AREA, type: "area" }),
        link({ label: "Rent", type: "search", target: "/rent", openInNewTab: true }),
      ],
      "header",
    );
    const links = toSiteLinks(items, new Map([[`page:${PAGE}`, "/about"]]));
    expect(links).toEqual([
      {
        label: "About",
        href: "/about",
        newTab: false,
        children: [{ label: "Team", href: "/team", newTab: false, children: [] }],
      },
      { label: "Rent", href: "/rent", newTab: true, children: [] },
    ]);
  });
});
