import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3200);
/** Locally the app runs in dev mode, where the first visit to a route compiles it first. */
const devMode = process.env.E2E_MODE !== "prod";

/**
 * End-to-end tests (14 §6). One shared database, so tests run one at a time.
 * `pnpm test:e2e` starts the e2e database + app via scripts/e2e-server.ts.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: devMode ? 240_000 : 120_000,
  expect: { timeout: devMode ? 60_000 : 20_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    // A cookie choice is already made, so the banner does not cover other tests' buttons;
    // tests/e2e/site-chrome.spec.ts starts without it to test the banner itself.
    storageState: {
      cookies: [
        {
          name: "keyline_consent",
          value: "v1.a0.m0.1760000000",
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 90_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
  webServer: {
    command: "pnpm exec tsx scripts/e2e-server.ts",
    url: `http://localhost:${port}/api/health`,
    timeout: 600_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
