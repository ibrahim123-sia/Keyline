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
try {
  for (const target of targets) {
    const [path, widthStr] = target.split("@");
    const width = Number(widthStr ?? 1280);
    const page = await browser.newPage({ viewport: { width, height: width < 600 ? 844 : 900 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const res = await page.goto(baseUrl + path, { waitUntil: "networkidle", timeout: 120_000 });
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
