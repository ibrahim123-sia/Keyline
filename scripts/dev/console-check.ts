/**
 * Dev helper: opens pages (optionally signed in) and prints console errors/warnings,
 * page errors and failed requests. `pnpm tsx scripts/dev/console-check.ts <baseUrl> <path>...`
 */
import { chromium } from "@playwright/test";

const [baseUrl, ...paths] = process.argv.slice(2);
const browser = await chromium.launch();
const context = await browser.newContext();
if (process.env.SHOT_EMAIL && process.env.SHOT_PASSWORD) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/admin/sign-in`, { waitUntil: "load" });
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(process.env.SHOT_EMAIL);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill(process.env.SHOT_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 60_000 });
  await page.close();
}
for (const path of paths) {
  const page = await context.newPage();
  const lines: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      lines.push(`${m.type()}: ${m.text().slice(0, 400)}`);
  });
  page.on("pageerror", (e) => lines.push(`pageerror: ${e.message.slice(0, 400)}`));
  page.on("requestfailed", (r) =>
    lines.push(`requestfailed: ${r.url().slice(0, 160)} ${r.failure()?.errorText}`),
  );
  await page.goto(baseUrl + path, { waitUntil: "load", timeout: 120_000 });
  // Optional interaction before collecting: CLICK="button:New top-level location"
  if (process.env.CLICK) {
    const [role, ...name] = process.env.CLICK.split(":");
    await page
      .getByRole(role as "button", { name: name.join(":") })
      .first()
      .click();
  }
  await page.waitForTimeout(Number(process.env.WAIT_MS ?? 4000));
  console.log(`== ${path}\n${lines.join("\n") || "(clean)"}`);
  await page.close();
}
await browser.close();
