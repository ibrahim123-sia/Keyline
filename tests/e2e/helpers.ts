import { execFileSync, spawn } from "node:child_process";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { Pool } from "pg";
import { localDataPath } from "../../scripts/paths";

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

/** Leads, contacts and everything hanging off them (the CRM tables), children first. */
export async function clearLeads(): Promise<void> {
  for (const table of [
    "messages",
    "approval_queue",
    "conversations",
    "shortlists",
    "lead_tasks",
    "lead_events",
    "viewings",
    "valuation_requests",
    "listing_requests",
    "newsletter_subscribers",
    "visitor_events",
    "leads",
    "visitors",
    "contacts",
  ])
    await db().query(`delete from ${table}`);
}

/**
 * Listings, projects and area guides point at master data and files with "restrict": clear
 * them first (a guide's photos hold library files, its area holds the location).
 */
export async function clearListings(): Promise<void> {
  await db().query("delete from area_guides");
  await db().query("delete from properties");
  await db().query("delete from projects");
  await db().query("delete from payment_plans where not is_template");
}

/**
 * Browser state with a cookie choice already made (as in playwright.config.ts), for extra
 * contexts a test opens itself: the cookie banner then never covers the page.
 */
export const decidedCookies = {
  cookies: [
    {
      name: "lintel_consent",
      value: "v1.a0.m0.1760000000",
      domain: "localhost",
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    },
  ],
  origins: [],
};

/** Expires cache tags after data was written straight to the database (tags as in lib/cache-tags). */
export async function revalidateTags(request: APIRequestContext, tags: string[]): Promise<void> {
  const res = await request.post("/api/internal/revalidate", {
    headers: { authorization: `Bearer ${INTERNAL_SECRET}` },
    data: { tags },
  });
  if (!res.ok()) throw new Error(`revalidate failed: ${res.status()}`);
}

/** Every cache tag family the public site uses: after writing data straight to the database. */
export const publicTags = [
  "settings",
  "listings",
  "search",
  "locations",
  "projects",
  "developers",
  "agents",
  "page:home",
  "pages",
  "posts",
  "area-guides",
  "faqs",
  "testimonials",
  "master:property-types",
  "master:facilities",
  "master:badges",
  "master:poi-types",
];

/**
 * Loads the Haven & Dune demo preset into the e2e database (the real `pnpm db:seed`, with the
 * e2e server's database and file folder), then expires the app's caches.
 */
export async function seedDemo(request: APIRequestContext): Promise<void> {
  const appUrl = `http://localhost:${process.env.E2E_PORT ?? 3200}`;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--import",
        "./scripts/register-server-only.mjs",
        "db/seed/index.ts",
        "--reset",
      ],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          DATABASE_URL: E2E_DB_URL,
          STORAGE_DRIVER: "fs",
          STORAGE_FS_DIR: localDataPath("e2e-media"),
          BETTER_AUTH_SECRET:
            process.env.BETTER_AUTH_SECRET ?? "e2e-secret-e2e-secret-e2e-secret-0123456",
          BETTER_AUTH_URL: appUrl,
          APP_URL: appUrl,
          SECRETS_ENCRYPTION_KEY:
            process.env.SECRETS_ENCRYPTION_KEY ?? "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
          LINTEL_ENV: "development",
          JOBS_DRIVER: "manual",
        },
      },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`the seed exited with ${code}`)),
    );
  });
  await revalidateTags(request, publicTags);
}

/**
 * Deletes locations and everything inside them, the deepest first: the parent link is
 * RESTRICT, which Postgres checks row by row. No slugs: every location.
 */
export async function deleteLocations(slugs?: string[]): Promise<void> {
  const { rows } = await db().query<{ id: string; depth: number }>(
    `with recursive tree as (
       select id, 0 as depth from locations where ${slugs ? "slug = any($1)" : "parent_id is null"}
       union all
       select l.id, t.depth + 1 from locations l join tree t on l.parent_id = t.id
     ) select id, depth from tree`,
    slugs ? [slugs] : [],
  );
  await db().query("delete from area_guides where location_id = any($1::uuid[])", [
    rows.map((r) => r.id),
  ]);
  const depths = [...new Set(rows.map((r) => r.depth))].sort((a, b) => b - a);
  for (const d of depths)
    await db().query("delete from locations where id = any($1::uuid[])", [
      rows.filter((r) => r.depth === d).map((r) => r.id),
    ]);
}

/**
 * The helpful 404 for a missing slug. Pages stream, so Next.js answers 200 with the not-found
 * page and a noindex tag (a "soft 404", Next 16 docs: loading -> Status codes); routes that
 * do not exist at all still get a real 404.
 */
export async function expectNotFoundPage(page: Page, path: string): Promise<void> {
  const res = await page.goto(path);
  expect([200, 404]).toContain(res?.status());
  await expect(
    page.getByRole("heading", { name: "We couldn't find that page", level: 1 }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
}
