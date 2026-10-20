/** Dev helper: is the MapLibre canvas there, sized, and drawing? */
import { chromium } from "@playwright/test";
const [baseUrl, out] = process.argv.slice(2);
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.on("console", (m) => console.log(`console.${m.type()}: ${m.text().slice(0, 200)}`));
page.on("requestfailed", (r) =>
  console.log(`failed: ${r.url().slice(0, 120)} ${r.failure()?.errorText}`),
);
page.on("response", (r) => {
  if (/openfreemap|maptiler/.test(r.url()))
    console.log(`tile ${r.status()} ${r.url().slice(0, 100)}`);
});
await page.goto(`${baseUrl}/admin/sign-in`);
await page.getByRole("textbox", { name: "Email", exact: true }).fill(process.env.SHOT_EMAIL!);
await page.getByRole("textbox", { name: "Password", exact: true }).fill(process.env.SHOT_PASSWORD!);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL((u) => !u.pathname.includes("sign-in"));
await page.goto(`${baseUrl}/admin/setup/locations`);
await page.getByRole("button", { name: "New top-level location" }).click();
await page.waitForTimeout(12000);
const info = await page.evaluate(() => {
  const c = document.querySelector("canvas.maplibregl-canvas") as HTMLCanvasElement | null;
  const gl = c?.getContext("webgl2") ?? c?.getContext("webgl");
  return {
    canvas: !!c,
    w: c?.width,
    h: c?.height,
    cssW: c?.clientWidth,
    cssH: c?.clientHeight,
    gl: !!gl,
  };
});
console.log(JSON.stringify(info));
const region = page.getByRole("region", { name: "Map: click or drag the pin to set the location" });
await region.screenshot({ path: out });
await browser.close();
