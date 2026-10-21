import { describe, expect, it } from "vitest";
import {
  analyzeRedirects,
  normalizePath,
  parseRedirectCsv,
  redirectInputSchema,
} from "@/features/seo/redirect-schema";

describe("redirect addresses", () => {
  it("normalizes paths for matching", () => {
    expect(normalizePath("/Old-Page/")).toBe("/old-page");
    expect(normalizePath("old-page")).toBe("/old-page");
    expect(normalizePath("https://agency.example/A/b/?ID=5")).toBe("/a/b?id=5");
    expect(normalizePath("/caf%C3%A9")).toBe("/café");
    expect(normalizePath("/")).toBe("/");
  });

  it("validates a redirect", () => {
    const ok = redirectInputSchema.safeParse({ fromPath: "/Old/", toPath: "/new/" });
    expect(ok.data).toEqual({ fromPath: "/old", toPath: "/new", type: 301 });
    const external = redirectInputSchema.safeParse({
      fromPath: "/x",
      toPath: "https://Other.example/Case",
      type: 302,
    });
    expect(external.data?.toPath).toBe("https://Other.example/Case");
    const bad = (input: Record<string, unknown>) =>
      redirectInputSchema.safeParse(input).error?.issues[0]?.path.join(".");
    expect(bad({ fromPath: "/", toPath: "/a" })).toBe("fromPath");
    expect(bad({ fromPath: "/admin/x", toPath: "/a" })).toBe("fromPath");
    expect(bad({ fromPath: "/a", toPath: "javascript:alert(1)" })).toBe("toPath");
    expect(bad({ fromPath: "/a", toPath: "//evil.example" })).toBe("toPath");
    expect(bad({ fromPath: "/a", toPath: "/A/" })).toBe("toPath");
    expect(bad({ fromPath: "/a", toPath: "/b", type: 307 })).toBe("type");
  });

  it("finds chains and loops", () => {
    const flags = analyzeRedirects([
      { fromPath: "/a", toPath: "/b" },
      { fromPath: "/b", toPath: "/c" },
      { fromPath: "/x", toPath: "/y" },
      { fromPath: "/y", toPath: "/x" },
      { fromPath: "/out", toPath: "https://other.example/a" },
    ]);
    expect(flags.get("/a")).toMatchObject({ chain: true, loop: false, finalTo: "/c", hops: 1 });
    expect(flags.get("/b")).toMatchObject({ chain: false, loop: false, finalTo: "/c" });
    expect(flags.get("/x")).toMatchObject({ loop: true, chain: false });
    expect(flags.get("/out")).toMatchObject({ chain: false, loop: false });
  });

  it("reads a CSV with a header, reporting bad lines", () => {
    const { rows, problems } = parseRedirectCsv(
      [
        "from,to,type",
        "/old-a,/new-a,301",
        "/old-b,/new-b",
        "/old-c,/new-c,307",
        "/OLD-A,/elsewhere",
        "not a path with spaces,/x",
        "",
        "/old-d;/new-d",
      ].join("\n"),
    );
    expect(rows.map((r) => [r.line, r.fromPath, r.toPath, r.type])).toEqual([
      [2, "/old-a", "/new-a", 301],
      [3, "/old-b", "/new-b", 301],
    ]);
    expect(problems.map((p) => p.line)).toEqual([4, 5, 6, 8]);
    expect(problems[1]?.message).toContain("line 2");
  });
});
