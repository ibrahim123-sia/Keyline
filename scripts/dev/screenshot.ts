/**
 * Dev helper: screenshots of local pages for visual review.
 *   pnpm tsx scripts/dev/screenshot.ts <outDir> <baseUrl> <path>[@width] ...
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const [outDir, baseUrl, ...targets] = process.argv.slice(2);
if (!outDir || !baseUrl || targets.length === 0) {
  console.error("usage: screenshot.ts <outDir> <baseUrl> <path>[@width] ...");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext();
// Optional sign-in first (SHOT_EMAIL / SHOT_PASSWORD), e.g. for admin screens.
if (process.env.SHOT_EMAIL && process.env.SHOT_PASSWORD) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}${process.env.SHOT_LOGIN_PATH ?? "/admin/sign-in"}`, {
    waitUntil: "load",
  });
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(process.env.SHOT_EMAIL);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill(process.env.SHOT_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 60_000 });
  await page.close();
}
try {
  for (const target of targets) {
    const [path, widthStr] = target.split("@");
    const width = Number(widthStr ?? 1280);
    const page = await context.newPage();
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const res = await page.goto(baseUrl + path, { waitUntil: "load", timeout: 120_000 });
    await page.waitForTimeout(1500);
    const file = join(outDir, `${path.replace(/[^a-z0-9]+/gi, "_") || "home"}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(
      `${path} @${width}: ${res?.status()} -> ${file}${errors.length ? `\n  errors: ${errors.join(" | ")}` : ""}`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
