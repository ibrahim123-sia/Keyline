import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";

/** The e2e database started by scripts/e2e-server.ts. */
export const E2E_DB_URL = `postgres://postgres:postgres@127.0.0.1:${process.env.E2E_DB_PORT ?? 5434}/postgres`;
export const INTERNAL_SECRET = process.env.INTERNAL_JOB_SECRET ?? "e2e-internal-secret";

let pool: Pool | null = null;
export function db(): Pool {
  pool ??= new Pool({ connectionString: E2E_DB_URL, max: 2 });
  return pool;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}@e2e.lintel`;
}

/** Runs the real setup command (`pnpm admin:create`) against the e2e database. */
export function createAdmin(email: string, password: string, name = "E2E Admin"): void {
  // node + tsx directly (no shell), so arguments with spaces survive on Windows.
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/create-admin.ts",
      "--email",
      email,
      "--name",
      name,
      "--password",
      password,
    ],
    { env: { ...process.env, DATABASE_URL: E2E_DB_URL }, stdio: "pipe" },
  );
}

/** Latest email sent to an address (the dev outbox: email_log). */
export async function latestEmail(
  to: string,
  template: string,
): Promise<{ html: string; text: string }> {
  for (let i = 0; i < 40; i++) {
    const res = await db().query(
      'select html, text from email_log where lower("to") = lower($1) and template = $2 order by created_at desc limit 1',
      [to, template],
    );
    if (res.rows[0]) return res.rows[0] as { html: string; text: string };
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No ${template} email for ${to}`);
}

export function linkFrom(html: string, contains: string): string {
  const href = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replaceAll("&amp;", "&"));
  const link = href.find((h) => h.includes(contains));
  if (!link) throw new Error(`No link containing ${contains}`);
  return link;
}

/**
 * Next keeps previously visited routes mounted but hidden, so tests use role queries
 * (which skip hidden elements) instead of getByLabel.
 */
export function field(page: Page, name: string) {
  return page.getByRole("textbox", { name, exact: true });
}

export async function signIn(page: Page, path: string, email: string, password: string) {
  await page.goto(path);
  await field(page, "Email").fill(email);
  await field(page, "Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function expectPath(page: Page, path: string | RegExp) {
  await expect(page).toHaveURL(
    typeof path === "string"
      ? new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\?|$)`)
      : path,
  );
}
