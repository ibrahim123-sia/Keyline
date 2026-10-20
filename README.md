# Lintel

AI-powered website, CRM and lead engine for real estate agencies. One agency installs it and
runs its whole business from it: listings, website pages, blog, SEO, leads, viewings and
reports, with an AI assistant for visitors and another for the admin.

- Specification: [`lintel-spec/lintel-spec`](lintel-spec/lintel-spec/README.md)
- Build status, decisions and open questions: [`PROGRESS.md`](PROGRESS.md)
- Changes: [`CHANGELOG.md`](CHANGELOG.md)

## Stack

Next.js 16 (App Router, Cache Components, Server Actions) · TypeScript strict · Tailwind CSS v4 +
shadcn/ui · Drizzle ORM · PostgreSQL (Neon in production; PostGIS, pgvector, pg_trgm, unaccent) ·
Better Auth · Cloudflare Workers via OpenNext (R2, Queues, Hyperdrive, Cron, Images, Browser
Rendering) · Vitest + Playwright.

## Local setup

Requirements: Node.js 22+ (developed on 24) and pnpm 12. No Docker or local PostgreSQL needed:
the dev database is PostgreSQL 18 compiled to WebAssembly (PGlite) with the same extensions as
production.

```bash
pnpm install
cp .env.example .env.local        # then fill BETTER_AUTH_SECRET, SECRETS_ENCRYPTION_KEY, INTERNAL_JOB_SECRET
pnpm db:start                     # terminal 1: local database on 127.0.0.1:5433 (data in .data/pglite)
pnpm db:migrate                   # apply migrations
pnpm admin:create --email you@agency.com --name "Your Name"   # prints a generated password
pnpm dev                          # terminal 2: http://localhost:3000
pnpm dev:cron                     # optional terminal 3: runs the every-minute scheduler locally
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Sign in at `/admin/sign-in`. Admins must set up two-step verification (TOTP) at first sign-in
(can be relaxed in Settings -> Security for a demo). Customers sign up at `/sign-up`; in
development, emails are not sent: they are stored in the `email_log` table (status `mocked`)
until a Resend key is added in Settings -> Integrations.

### Useful scripts

| Script                                                   | What it does                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm db:start [--memory]`                               | Local PostgreSQL 18 (PGlite) server                                         |
| `pnpm db:migrate` / `pnpm db:generate`                   | Apply / create migrations (Drizzle Kit)                                     |
| `pnpm db:reset --yes`                                    | Drop everything and re-apply migrations (refuses in production)             |
| `pnpm admin:create --email … [--name …] [--password …]`  | Create or promote an admin                                                  |
| `pnpm dev:cron`                                          | Call the cron endpoint every minute (local stand-in for the Worker trigger) |
| `pnpm lint` / `pnpm typecheck` / `pnpm format`           | Quality checks                                                              |
| `pnpm test:unit` / `pnpm test:integration` / `pnpm test` | Vitest (integration uses an in-memory DB)                                   |
| `pnpm test:e2e`                                          | Playwright (starts its own database and app on port 3200)                   |

### Environment variables

Everything is documented in [`.env.example`](.env.example). Integration keys (Google Maps,
WhatsApp, Resend, AI provider) are **not** environment variables: admins enter them in
Settings -> Integrations, and they are stored encrypted (AES-256-GCM) in the database.

## Tests

- **Unit** (`tests/unit`): ids, geometry parsing, encryption, settings schemas, audit diffs,
  contrast, permissions, password strength, cron scheduling.
- **Integration** (`tests/integration`): settings storage and audit, encrypted secrets, auth flows
  (sign-up, verification, lockout, deactivation, admin sessions, TOTP), database bridge protocol.
- **End to end** (`tests/e2e`): guests blocked from `/admin` and `/account`; customer sign-up and
  email verification; first admin with 2FA; design token change after revalidation.

## Deploy to Cloudflare

Production builds run on Linux (CI or WSL): OpenNext's bundler creates symlinks, which Windows
only allows in Developer Mode.

1. Create a Neon project (PostgreSQL 16+) and enable the extensions (the first migration does
   `CREATE EXTENSION` for postgis, vector, pg_trgm, unaccent).
2. In Cloudflare: create the R2 buckets (`lintel-cache`, `lintel-media`, plus `-staging`
   variants), the queues (`lintel-jobs`, `lintel-jobs-dlq`, plus `-staging` variants) and a
   Hyperdrive config pointing at Neon (`wrangler hyperdrive create`).
3. Set Worker secrets per environment:
   `wrangler secret put BETTER_AUTH_SECRET --env staging` (and `SECRETS_ENCRYPTION_KEY`,
   `INTERNAL_JOB_SECRET`, `TURNSTILE_SECRET_KEY`, `BETTER_AUTH_URL`, `APP_URL`).
4. GitHub repository: secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
   `STAGING_DATABASE_URL`, `HYPERDRIVE_ID_STAGING`; variables `STAGING_APP_URL`,
   `TURNSTILE_SITE_KEY` and `DEPLOY_STAGING=true`. Every push to `main` then runs lint, types,
   tests, Playwright and the Workers build, migrates the staging database and deploys.

How it runs on Workers: [`worker/index.ts`](worker/index.ts) wraps the OpenNext handler and adds
the Queue consumer and the every-minute Cron trigger. Both forward to internal routes
(`/api/internal/jobs`, `/api/internal/cron`, protected by `INTERNAL_JOB_SECRET`), so background
work runs inside the Next.js bundle. Caching uses R2 + regional cache for entries and sharded
Durable Objects for cache tags ([`open-next.config.ts`](open-next.config.ts)).

## Project layout

```
app/          routes: (site) public, (account) customer area, admin, api
components/   ui (shadcn), site, admin, account, auth, forms
features/     one folder per module (settings, media, notifications, admin-users, ...)
db/           Drizzle schema, migrations, migrate script
lib/          auth, permissions, env, tokens, i18n, crypto, rate limits, audit, geo
jobs/         background job registry, runner, cron schedule
emails/       React Email templates
worker/       Cloudflare custom worker (queue + cron)
scripts/      local database, test database, setup commands, dev cron
tests/        unit, integration, e2e
```
