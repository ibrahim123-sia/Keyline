import { execFileSync } from "node:child_process";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
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

const AGENCY_ID = process.env.AGENCY_ID || "0192f000-0000-7000-8000-000000000001";

/** Stores one settings group (merged over what is there) and expires its cache tag. */
export async function setSettings(
  request: APIRequestContext,
  group: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await db().query(
    `insert into settings (id, agency_id, "group", value) values (gen_random_uuid(), $1, $2, $3::jsonb)
     on conflict (agency_id, "group") do update set value = settings.value || excluded.value, updated_at = now()`,
    [AGENCY_ID, group, JSON.stringify(patch)],
  );
  const res = await request.post("/api/internal/revalidate", {
    headers: { authorization: `Bearer ${INTERNAL_SECRET}` },
    data: { tags: [`settings:${group}`] },
  });
  if (!res.ok()) throw new Error(`revalidate failed: ${res.status()}`);
}

/**
 * Signs in as a fresh admin. Admin feature specs relax the 2FA requirement (as the demo
 * preset does); the 2FA flow itself is covered in auth.spec.ts.
 */
export async function signInAsAdmin(page: Page, request: APIRequestContext) {
  await setSettings(request, "security", { require2fa: false });
  const email = uniqueEmail("admin");
  const password = "admin-e2e-password-1";
  createAdmin(email, password, "Admin E2E");
  await signIn(page, "/admin/sign-in", email, password);
  // The first sign-in after the dev server starts also compiles the auth route and admin
  // pages, which takes minutes on a busy machine (CI runs a production build instead).
  await expect(page).toHaveURL(/\/admin(\?|$)/, {
    timeout: process.env.E2E_MODE === "prod" ? 30_000 : 180_000,
  });
  return { email, password };
}

/** Saves a review screenshot when E2E_SNAP_DIR is set (local visual review; off in CI). */
export async function snap(page: Page, name: string): Promise<void> {
  const dir = process.env.E2E_SNAP_DIR;
  if (!dir) return;
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

/** Listings and projects point at master data and files with "restrict": clear them first. */
export async function clearListings(): Promise<void> {
  await db().query("delete from properties");
  await db().query("delete from projects");
  await db().query("delete from payment_plans where not is_template");
}
