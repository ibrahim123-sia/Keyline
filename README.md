<div align="center">

# Keyline

**The website, CRM and lead engine for real estate agencies, in one app.**

[![CI](https://github.com/ibrahim123-sia/Keyline/actions/workflows/ci.yml/badge.svg)](https://github.com/ibrahim123-sia/Keyline/actions/workflows/ci.yml)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/runs%20on-Cloudflare%20Workers-f38020?logo=cloudflare&logoColor=white)
![License: proprietary](https://img.shields.io/badge/license-proprietary-lightgrey)

</div>

One agency installs Keyline and runs its whole business from it: listings and projects, the public
website and blog, SEO, leads from every channel, viewings, the customer area and buyer tools, with
an AI assistant for visitors and another for the team.

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Demo data](#demo-data)
- [Configuration](#configuration)
- [Using Keyline from Claude (MCP)](#using-keyline-from-claude-mcp)
- [Scripts](#scripts)
- [Testing](#testing)
- [Deployment](#deployment)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Documentation](#documentation)
- [Contributing, security and license](#contributing-security-and-license)

## Features

| Area                    | What it does                                                                                                                                                                                        | Status      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Public website          | Search for sale, rent and off-plan with filters in the URL, a map with price pins and draw-your-area, property, project, developer and agent pages, currency switcher, structured data, helpful 404 | Available   |
| Listings and projects   | Listing editor with autosave and publish rules, media library on R2, payment plans, nearby places with travel times, CSV import and export, projects with unit types                                | Available   |
| Website builder and SEO | Page builder with every section type, blog, area guides, testimonials and FAQs, menus and footer, sitemap, robots, redirects with real 301s, 404 monitor and SEO report                             | Available   |
| Leads and CRM           | A lead from every source with first and last touch attribution, dedupe, assignment, scoring with reasons, response timer, leads board, inbox (WhatsApp, email, portals, social forms, website chat) | Available   |
| Viewings                | Online booking at real free times, reminders, calendar invites, a private link to move or cancel, admin calendar, Google Calendar sync                                                              | Available   |
| Marketing               | Campaign links with QR codes, campaign report, newsletter with double opt-in, editable message templates                                                                                            | Available   |
| Customer area           | Saved homes and shareable lists, saved searches with instant, daily and weekly alerts, price-drop and status alerts, compare, tours, data download and account deletion                             | Available   |
| Buyer tools             | Mortgage and rental-return calculators, compare page, branded PDF brochure, valuation, list your property, price trends, commute search, share cards                                                | In progress |
| AI                      | Customer assistant on the website and WhatsApp, admin assistant with preview and confirm, AI writing helpers, MCP server                                                                            | In progress |
| Reports and launch      | Dashboard KPIs, reports with CSV and PDF export, accessibility and performance passes                                                                                                               | Planned     |

Everything the agency sees is configurable from Settings: branding, market (currency, units,
time zone), contact details, integrations, lead rules and AI behaviour. Nothing about a market or
an agency is hard-coded.

## Tech stack

| Layer     | Choice                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------ |
| Framework | Next.js 16 (App Router, Cache Components, Server Actions), React 19, TypeScript in strict mode         |
| UI        | Tailwind CSS v4, shadcn/ui, design tokens generated from the Branding settings                         |
| Data      | PostgreSQL with PostGIS, pgvector, pg_trgm and unaccent; Drizzle ORM and migrations                    |
| Auth      | Better Auth: email and password, email verification, TOTP two-step verification for admins             |
| Hosting   | Cloudflare Workers via OpenNext, with R2, Queues, Hyperdrive, Cron Triggers, Images, Browser Rendering |
| Maps      | MapLibre GL with terra-draw; Google Maps Platform (Geocoding, Places, Routes) from the server only     |
| Email     | Resend with React Email templates                                                                      |
| Quality   | Vitest (unit and integration), Playwright (end to end), ESLint, Prettier, GitHub Actions               |

## Getting started

### Prerequisites

- Node.js 22 or newer (developed on Node.js 24)
- pnpm 12 (`corepack enable` picks the version pinned in `package.json`)

No Docker or local PostgreSQL install is needed: the development database is PostgreSQL 18
compiled to WebAssembly (PGlite), with the same extensions as production.

### Run it locally

```bash
pnpm install
cp .env.example .env.local      # fill BETTER_AUTH_SECRET, SECRETS_ENCRYPTION_KEY, INTERNAL_JOB_SECRET
pnpm db:start                   # terminal 1: database on 127.0.0.1:5433 (data in ~/.keyline/pglite)
pnpm db:migrate
pnpm db:seed                    # optional: the demo agency (see below)
pnpm dev                        # terminal 2: http://localhost:3000
pnpm dev:cron                   # optional terminal 3: the every-minute scheduler
```

Generate each secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

To start without demo data, create the first admin instead of seeding:

```bash
pnpm admin:create --email you@agency.com --name "Your Name"   # prints a generated password
```

Admins sign in at `/admin/sign-in` and set up two-step verification at first sign-in. Customers
sign up at `/sign-up`. In development no email leaves the machine: messages are stored in the
`email_log` table (status `mocked`) until a Resend key is added in Settings → Integrations.

## Demo data

`pnpm db:seed` loads **Haven & Dune**, a fictional agency with listings, projects, developers,
agents, pages, blog posts, leads, viewings, campaign data and customers. Passwords are generated
and printed once at the end of the run; two-step verification is off for the demo accounts.

| Account                      | Role            |
| ---------------------------- | --------------- |
| `admin@demo.keyline`         | Admin (owner)   |
| `staff@demo.keyline`         | Admin           |
| `viewer@demo.keyline`        | Read-only admin |
| `mina@demo.keyline`          | Customer        |
| `omar.customer@demo.keyline` | Customer        |
| `lucy@demo.keyline`          | Customer        |

Each demo customer has saved homes, a saved search and a past tour.

Use `pnpm db:seed --reset` to replace the demo data in an existing database.

## Configuration

- **Environment variables** cover only what the app needs to start (database, auth and
  encryption secrets, internal job secret, Turnstile). They are documented in
  [`.env.example`](.env.example). [`.dev.vars.example`](.dev.vars.example) is only for
  `pnpm preview` (the app inside the local Workers runtime).
- **Integration keys** (Google Maps, WhatsApp, Resend, Meta and TikTok lead forms, Google
  Calendar, the AI provider) are not environment variables. Admins enter them in
  Settings → Integrations, and they are stored encrypted (AES-256-GCM) in the database.

## Using Keyline from Claude (MCP)

Keyline is an MCP server at `/api/mcp` (Streamable HTTP, JSON responses). It offers the admin
assistant's tools: questions about leads, listings and reports, and changes that are only
proposed until an admin confirms them.

1. In **Settings → Admin users**, create a personal API token. "Read" tokens see the read tools;
   "Read + propose" tokens can also prepare changes and confirm them with `confirm_action`.
   The token is shown once.
2. Keep **Settings → AI → MCP** switched on (it is by default). The write actions offered
   follow the same "Allowed actions" checkboxes as the admin assistant.
3. Add the server to your MCP client. For Claude Code:

   ```bash
   claude mcp add --transport http keyline https://your-domain.example/api/mcp \
     --header "Authorization: Bearer lnt_your_token"
   ```

   For a client that reads a JSON config:

   ```json
   {
     "mcpServers": {
       "keyline": {
         "type": "http",
         "url": "https://your-domain.example/api/mcp",
         "headers": { "Authorization": "Bearer lnt_your_token" }
       }
     }
   }
   ```

A write tool never changes anything by itself: it returns a proposal id and a preview. The
change waits in the admin (and in `list_pending_actions`) until an admin confirms it, and the
audit log records it with the AI as the actor and the confirming admin. Deleting, settings,
users, bulk exports and publishing are not available to the AI at all.

## Scripts

| Script                                                   | What it does                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm dev`                                               | Next.js development server                                      |
| `pnpm db:start [--memory]`                               | Local PostgreSQL 18 (PGlite) server                             |
| `pnpm db:migrate` / `pnpm db:generate`                   | Apply / create migrations (Drizzle Kit)                         |
| `pnpm db:seed [--reset]`                                 | Load the demo agency                                            |
| `pnpm db:reset --yes`                                    | Drop everything and re-apply migrations (refuses in production) |
| `pnpm admin:create --email … [--name …]`                 | Create or promote an admin                                      |
| `pnpm dev:cron`                                          | Call the cron endpoint every minute (stands in for the Worker)  |
| `pnpm ai:eval`                                           | Run the AI eval set (test provider unless a key is given)       |
| `pnpm ai:backfill` / `pnpm ai:prompts`                   | Rebuild the search index / bundle the prompt files              |
| `pnpm lint` / `pnpm typecheck` / `pnpm format:check`     | Quality checks                                                  |
| `pnpm test:unit` / `pnpm test:integration` / `pnpm test` | Vitest (integration tests use an in-memory database)            |
| `pnpm test:e2e`                                          | Playwright (starts its own database and app on port 3200)       |
| `pnpm preview` / `pnpm deploy` / `pnpm deploy:staging`   | Build with OpenNext and preview or deploy to Cloudflare         |

## Testing

- **Unit tests** (`tests/unit`): pure logic such as attribution channels, scoring, slots and
  time zones, money and units, permissions, redirects, search parameters and settings schemas.
- **Integration tests** (`tests/integration`): server code against a real PostgreSQL (PGlite):
  lead pipeline, viewings, alerts, accounts, settings and audit, auth flows, the seed, PDF
  rendering.
- **End-to-end tests** (`tests/e2e`): the main journeys in Chromium on desktop and phone sizes
  against a production build, with a Lighthouse report for the property page.

Every push and pull request runs lint, types, formatting, a schema-vs-migrations check, unit and
integration tests, a dependency audit, Playwright against a production build, and the Cloudflare
Workers bundle ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Deployment

Production builds run on Linux (CI or WSL): OpenNext's bundler creates symlinks, which Windows
only allows in Developer Mode.

1. Create a Neon project (PostgreSQL 16 or newer). The first migration enables the PostGIS,
   pgvector, pg_trgm and unaccent extensions.
2. In Cloudflare, create the R2 buckets (`keyline-cache`, `keyline-media`, plus `-staging`
   variants), the queues (`keyline-jobs`, `keyline-jobs-dlq`, plus `-staging` variants) and a
   Hyperdrive configuration pointing at Neon (`wrangler hyperdrive create`).
3. Set the Worker secrets for each environment, for example
   `wrangler secret put BETTER_AUTH_SECRET --env staging`, and likewise `SECRETS_ENCRYPTION_KEY`,
   `INTERNAL_JOB_SECRET`, `TURNSTILE_SECRET_KEY`, `BETTER_AUTH_URL` and `APP_URL`.
4. In the GitHub repository, add the secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
   `STAGING_DATABASE_URL` and `HYPERDRIVE_ID_STAGING`, and the variables `STAGING_APP_URL`,
   `TURNSTILE_SITE_KEY` and `DEPLOY_STAGING=true`. Every push to `main` then migrates the staging
   database and deploys once all checks pass.

## Architecture

- **One Next.js app** serves the public site (`app/(site)`), the customer area
  (`app/(account)`), the admin portal (`app/admin`) and the API (`app/api`).
- **Feature modules** in `features/` hold each domain's schema validation, queries, server
  actions and jobs; pages and components stay thin.
- **Caching** uses Cache Components: public data is cached with tags and revalidated precisely
  when an admin changes it. On Cloudflare, entries live in R2 behind the regional cache, and tags
  in sharded Durable Objects ([`open-next.config.ts`](open-next.config.ts)).
- **Background work**: [`worker/index.ts`](worker/index.ts) wraps the OpenNext handler and adds
  the Queue consumer and an every-minute Cron trigger. Both call internal routes protected by
  `INTERNAL_JOB_SECRET`, so jobs run inside the Next.js bundle with retries and a dead-letter
  queue ([`jobs/`](jobs)).
- **Security**: every admin page, action and route checks permissions on the server, inputs are
  validated with Zod, admin changes are written to an append-only audit log, and integration
  secrets are encrypted at rest.

## Project structure

```
app/          routes: (site) public website, (account) customer area, admin portal, api
components/   ui (shadcn), site (with the page-builder sections), account, admin, maps, forms
features/     one folder per domain module: queries, actions, validation, jobs
db/           Drizzle schema, migrations and the demo seed
lib/          auth, permissions, i18n, tokens, money and units, storage, PDF, rate limits, audit
jobs/         job registry, runner and cron schedule
emails/       React Email templates
worker/       Cloudflare Worker entry (queue consumer and cron)
scripts/      local database, test database, setup and CI helpers
tests/        unit, integration and end-to-end tests
docs/         product specification and build progress
```

## Documentation

- [`docs/spec/`](docs/spec/README.md): the product specification, from rules and stack to the
  build phases.
- [`docs/PROGRESS.md`](docs/PROGRESS.md): build status per phase, done-when checklists, and the
  decisions taken along the way.
- [`CHANGELOG.md`](CHANGELOG.md): notable changes.

## Contributing, security and license

- How to set up, branch, commit and open a pull request: [`CONTRIBUTING.md`](.github/CONTRIBUTING.md).
- To report a vulnerability privately: [`SECURITY.md`](.github/SECURITY.md).
- Keyline is proprietary software. See [`LICENSE`](LICENSE).
