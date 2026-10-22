import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matchRedirect, type RedirectRule } from "@/features/seo/redirect-path";

const rules = new Map<string, RedirectRule>([
  ["/old-about", { id: "a", to: "/about", status: 301 }],
  ["/buy?area=marina", { id: "b", to: "/buy/dubai-marina", status: 301 }],
  ["/promo", { id: "c", to: "/off-plan?utm_source=print", status: 302 }],
  ["/gone", { id: "d", to: "https://partner.example/page", status: 301 }],
]);

describe("redirect rules (08 §6)", () => {
  it("matches normalised addresses: case, trailing slash, encoded characters", () => {
    expect(matchRedirect(rules, "/Old-About/")).toEqual({
      rule: rules.get("/old-about"),
      to: "/about",
    });
    expect(matchRedirect(rules, "/old%2Dabout")).toMatchObject({ to: "/about" });
    expect(matchRedirect(rules, "/about")).toBeNull();
  });

  it("an exact rule with a query wins; a bare rule keeps the visitor's query", () => {
    expect(matchRedirect(rules, "/buy?area=marina")).toMatchObject({ to: "/buy/dubai-marina" });
    expect(matchRedirect(rules, "/old-about?utm_source=ad")).toMatchObject({
      to: "/about?utm_source=ad",
    });
    // A target with its own query is not given the visitor's.
    expect(matchRedirect(rules, "/promo?x=1")).toMatchObject({ to: "/off-plan?utm_source=print" });
  });
});

describe("middleware redirects", () => {
  const calls: Array<{ url: string; method: string }> = [];
  beforeEach(() => {
    vi.resetModules();
    calls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method ?? "GET" });
        if ((init?.method ?? "GET") === "POST") return new Response(null, { status: 204 });
        return Response.json({
          rules: [
            ["/old-about", "a", "/about", 301],
            ["/promo", "c", "/off-plan", 302],
            ["/gone", "d", "https://partner.example/page", 301],
          ],
        });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("loads the rules once, answers with the rule's status and reports the hit", async () => {
    const { edgeRedirect } = await import("@/features/seo/edge-redirects");
    const later: Array<Promise<unknown>> = [];
    const wait = (p: Promise<unknown>) => later.push(p);
    const site = (path: string) => new URL(path, "https://havendune.example");

    expect(await edgeRedirect(site("/old-about"), wait)).toEqual({
      location: "https://havendune.example/about",
      status: 301,
    });
    expect(await edgeRedirect(site("/promo"), wait)).toMatchObject({ status: 302 });
    expect(await edgeRedirect(site("/gone"), wait)).toEqual({
      location: "https://partner.example/page",
      status: 301,
    });
    expect(await edgeRedirect(site("/buy"), wait)).toBeNull();
    await Promise.all(later);
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(3);
    expect(calls[0]!.url).toBe("https://havendune.example/api/internal/redirects");
  });

  it("an unreachable rules endpoint means no redirect, never an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503 })),
    );
    const { edgeRedirect } = await import("@/features/seo/edge-redirects");
    expect(await edgeRedirect(new URL("https://x.example/old-about"), () => {})).toBeNull();
  });
});
