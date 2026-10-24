import { describe, expect, it } from "vitest";
import { logLine } from "@/lib/log";
import { parseReports } from "@/lib/security/csp-report";
import {
  baseSecurityHeaders,
  contentSecurityPolicy,
  pageCsp,
  sourcesFromEnv,
} from "@/lib/security/headers";

const directive = (policy: string, name: string) =>
  policy
    .split("; ")
    .find((d) => d.startsWith(`${name} `) || d === name)
    ?.split(" ")
    .slice(1) ?? null;

describe("Content-Security-Policy (14 §2)", () => {
  it("locks down everything around scripts and allows only the services the app uses", () => {
    const csp = contentSecurityPolicy({ dev: false, upgradeInsecure: true });
    expect(directive(csp, "default-src")).toEqual(["'self'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "form-action")).toEqual(["'self'"]);
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "script-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
      "https://challenges.cloudflare.com",
    ]);
    expect(directive(csp, "connect-src")).toEqual(
      expect.arrayContaining([
        "'self'",
        "https://tiles.openfreemap.org",
        "https://api.maptiler.com",
      ]),
    );
    expect(directive(csp, "worker-src")).toEqual(["'self'", "blob:"]);
    expect(directive(csp, "frame-src")).toEqual(
      expect.arrayContaining(["https://www.youtube-nocookie.com", "https://player.vimeo.com"]),
    );
    expect(directive(csp, "img-src")).toContain("https://i.ytimg.com");
    expect(csp).toContain("upgrade-insecure-requests");
    // Never eval in production; nonces are not used (see lib/security/headers.ts).
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("nonce-");
  });

  it("adds eval and the dev websocket only in development, WebAssembly only in the admin", () => {
    const dev = contentSecurityPolicy({ dev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
    expect(dev).not.toContain("upgrade-insecure-requests");
    const admin = contentSecurityPolicy({ dev: false, admin: true });
    expect(directive(admin, "script-src")).toContain("'wasm-unsafe-eval'");
    expect(directive(contentSecurityPolicy({ dev: false }), "script-src")).not.toContain(
      "'wasm-unsafe-eval'",
    );
  });

  it("lets only the page builder preview be framed, by this site", () => {
    const env = { NODE_ENV: "production", APP_URL: "https://agency.example" };
    expect(directive(pageCsp("/preview/abc", env).value, "frame-ancestors")).toEqual(["'self'"]);
    expect(directive(pageCsp("/", env).value, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(pageCsp("/admin/pages", env).value, "script-src")).toContain(
      "'wasm-unsafe-eval'",
    );
  });

  it("switches to report-only from the environment and reports to /api/csp-report", () => {
    const enforced = pageCsp("/", { NODE_ENV: "production" });
    expect(enforced.name).toBe("Content-Security-Policy");
    expect(enforced.value).toContain("report-uri /api/csp-report");
    expect(enforced.value).not.toContain("upgrade-insecure-requests");
    expect(pageCsp("/", { NODE_ENV: "production", CSP_REPORT_ONLY: "true" }).name).toBe(
      "Content-Security-Policy-Report-Only",
    );
  });

  it("takes extra https origins from the environment and drops anything else", () => {
    expect(
      sourcesFromEnv(
        "https://tiles.example.com, https://cdn.example.com  'unsafe-eval' http://x.com *",
      ),
    ).toEqual(["https://tiles.example.com", "https://cdn.example.com"]);
    expect(sourcesFromEnv("https://a.example;script-src *")).toEqual([]);
    const csp = pageCsp("/", {
      NODE_ENV: "production",
      CSP_EXTRA_CONNECT_SRC: "https://tiles.example.com",
      CSP_EXTRA_SCRIPT_SRC: "https://widget.example.com",
    }).value;
    expect(directive(csp, "connect-src")).toContain("https://tiles.example.com");
    expect(directive(csp, "script-src")).toContain("https://widget.example.com");
  });
});

describe("fixed security headers", () => {
  it("sends HSTS in production builds only, and the rest everywhere", () => {
    const prod = Object.fromEntries(
      baseSecurityHeaders({ production: true }).map((h) => [h.key, h.value]),
    );
    expect(prod).toMatchObject({
      "Strict-Transport-Security": "max-age=63072000",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Cross-Origin-Opener-Policy": "same-origin",
      "X-Frame-Options": "DENY",
    });
    expect(prod["Permissions-Policy"]).toContain("camera=()");
    expect(
      baseSecurityHeaders({ production: false }).some((h) => h.key === "Strict-Transport-Security"),
    ).toBe(false);
  });
});

describe("CSP violation reports", () => {
  it("reads both report formats and keeps origins, not query strings", () => {
    const legacy = parseReports({
      "csp-report": {
        "document-uri": "https://agency.example/property/x?email=a@b.c",
        "effective-directive": "script-src-elem",
        "blocked-uri": "https://evil.example/x.js?token=1",
        disposition: "enforce",
      },
    });
    expect(legacy).toEqual([
      {
        page: "https://agency.example/property/x",
        directive: "script-src-elem",
        blocked: "https://evil.example",
        disposition: "enforce",
        source: null,
      },
    ]);
    const batch = parseReports([
      {
        type: "csp-violation",
        body: {
          documentURL: "https://agency.example/",
          effectiveDirective: "img-src",
          blockedURL: "inline",
        },
      },
      { type: "deprecation", body: {} },
    ]);
    expect(batch).toHaveLength(1);
    expect(batch[0]).toMatchObject({ directive: "img-src", blocked: "inline" });
  });
});

describe("structured logs (14 §5)", () => {
  it("writes one JSON line and redacts personal or secret fields", () => {
    const line = JSON.parse(
      logLine(
        "error",
        "lead.capture_failed",
        {
          requestId: "r1",
          email: "a@b.c",
          contact: { phone: "+1 212 555 0100", lastName: "Doe", stage: "new" },
          error: new Error("boom"),
        },
        new Date("2026-10-24T10:00:00Z"),
      ),
    );
    expect(line).toEqual({
      level: "error",
      event: "lead.capture_failed",
      at: "2026-10-24T10:00:00.000Z",
      requestId: "r1",
      email: "[redacted]",
      contact: { phone: "[redacted]", lastName: "[redacted]", stage: "new" },
      error: { name: "Error", message: "boom" },
    });
  });
});
