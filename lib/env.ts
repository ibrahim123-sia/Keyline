import { z } from "zod";

/**
 * Server environment. Parsed lazily so build steps that do not need a value do not fail.
 * Never import this from a Client Component: only NEXT_PUBLIC_* values reach the browser.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  KEYLINE_ENV: z.enum(["development", "staging", "production"]).default("development"),
  AGENCY_ID: z.uuid().default("0192f000-0000-7000-8000-000000000001"),
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  DATABASE_URL: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),

  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  SECRETS_ENCRYPTION_KEY: z.string().optional(),
  INTERNAL_JOB_SECRET: z.string().optional(),

  STORAGE_DRIVER: z.enum(["fs", "r2"]).default("fs"),
  /** Local media folder for the fs driver; defaults to ~/.keyline/media (see lib/storage). */
  STORAGE_FS_DIR: z.string().optional(),
  JOBS_DRIVER: z.enum(["inline", "queue", "manual"]).default("inline"),

  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().default("1x00000000000000000000AA"),
  TURNSTILE_SECRET_KEY: z.string().default("1x0000000000000000000000000000000AA"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(emptyToUndefined(process.env));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forget the parsed env so a test can change process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}

function emptyToUndefined(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] = value === "" ? undefined : value;
  }
  return out;
}

export function isProduction(): boolean {
  return env().KEYLINE_ENV === "production";
}

/** True when running inside Cloudflare Workers (OpenNext), false in Node (dev server, scripts, tests). */
export function isWorkersRuntime(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}
