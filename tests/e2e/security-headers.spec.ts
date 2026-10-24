import { expect, test, type APIRequestContext } from "@playwright/test";
import { watchCsp } from "./helpers";

/**
 * Security headers and the Content-Security-Policy (14 §2) on site, admin, preview and API
 * responses. The pages-without-violations check with real data is in us-preset.spec.ts.
 */
const header = async (path: string, request: APIRequestContext) => {
  const res = await request.get(path, { maxRedirects: 0 });
  return res.headers();
};

test("site, admin, preview and API responses carry the security headers", async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "headers do not depend on the device");
  test.setTimeout(240_000);

  const site = await header("/", request);
  expect(site["content-security-policy"]).toContain("default-src 'self'");
  expect(site["content-security-policy"]).toContain("object-src 'none'");
  expect(site["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(site["content-security-policy"]).toContain("report-uri /api/csp-report");
  expect(site["content-security-policy"]).not.toContain("wasm-unsafe-eval");
  expect(site).toMatchObject({
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "cross-origin-opener-policy": "same-origin",
    "x-frame-options": "DENY",
  });
  expect(site["permissions-policy"]).toContain("camera=()");
  expect(site["x-request-id"]).toBeTruthy();

  const admin = await header("/admin/sign-in", request);
  expect(admin["content-security-policy"]).toContain("'wasm-unsafe-eval'");
  expect(admin["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(admin["x-frame-options"]).toBe("DENY");

  // The page builder frames its preview from the admin: same origin only.
  const preview = await header("/preview/not-a-token", request);
  expect(preview["content-security-policy"]).toContain("frame-ancestors 'self'");
  expect(preview["x-frame-options"]).toBe("SAMEORIGIN");

  const api = await header("/api/health", request);
  expect(api["content-security-policy"]).toBe("default-src 'none'; frame-ancestors 'none'");
  expect(api["x-content-type-options"]).toBe("nosniff");
  expect(api["x-frame-options"]).toBe("DENY");
});

test("the violation report endpoint accepts both report formats", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "no device dependency");
  const legacy = await request.post("/api/csp-report", {
    headers: { "content-type": "application/csp-report" },
    data: JSON.stringify({
      "csp-report": { "document-uri": "http://localhost/", "effective-directive": "img-src" },
    }),
  });
  expect(legacy.status()).toBe(204);
  const batch = await request.post("/api/csp-report", {
    headers: { "content-type": "application/reports+json" },
    data: JSON.stringify([{ type: "csp-violation", body: { effectiveDirective: "script-src" } }]),
  });
  expect(batch.status()).toBe(204);
  const bad = await request.post("/api/csp-report", { data: "not json" });
  expect(bad.status()).toBe(400);
});

test("the sign-in pages load with no CSP violations", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "desktop run is enough");
  test.setTimeout(240_000);
  const violations = await watchCsp(page);
  await page.goto("/admin/sign-in");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Sign in" }).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(await violations()).toEqual([]);
});
