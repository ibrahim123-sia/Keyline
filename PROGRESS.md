# Lintel — Progress

Single source of truth for what is done, in progress and next. Updated after every step.
Spec: `lintel-spec/lintel-spec/` (README + `docs/01..16`).

## Status

| Phase | Name                     | Status      |
| ----- | ------------------------ | ----------- |
| 1     | Foundation               | in progress |
| 2     | Settings and master data | not started |
| 3     | Properties and projects  | not started |
| 4     | Public site core         | not started |
| 5     | CMS and SEO              | not started |
| 6     | Leads and CRM            | not started |
| 7     | Customer area            | not started |
| 8     | Tools                    | not started |
| 9     | AI                       | not started |
| 10    | Reports, polish, launch  | not started |

## Phase 1 — Foundation (plan)

1. Repo scaffold: Next.js 16.4 (App Router, RSC, Server Actions), TypeScript strict, Tailwind v4, shadcn/ui, ESLint (flat) + Prettier, Vitest, Playwright.
2. Database: Drizzle ORM + Drizzle Kit, migrations in git, PostGIS / pgvector custom types; local PostgreSQL 18 via PGlite server (`pnpm db:start`); core schema: users (+ Better Auth tables), settings, secrets, audit_log, agents, media.
3. Settings: typed JSON per group (Zod schemas with defaults), cached loader (`'use cache'` + `cacheTag('settings:<group>')`), revalidated on save.
4. Auth: Better Auth (email + password, email verification, password reset, optional Google for customers), roles `admin` | `customer`, TOTP 2FA for admins, session lengths (customer 30 days, admin 12 hours).
5. Permission helpers (`requireAdmin`, `requireCustomer`, `assertCan`) used by every admin page, action, route handler and AI tool. Audit log helper.
6. Design tokens: CSS variables generated from Branding settings, injected in the root layout; Desert Modern defaults.
7. Base layouts: site header/footer shells, account shell, admin sidebar + top bar (light/dark per admin).
8. i18n: one dictionary per area (`site`, `account`, `admin`), logical CSS properties only.
9. Cloudflare: OpenNext adapter, `wrangler.jsonc` with `staging` and `production` envs, custom worker (fetch + queue + scheduled), Hyperdrive, R2, Queues bindings.
10. CI: GitHub Actions — lint, type check, unit tests, migration check, Playwright; deploy to staging when Cloudflare secrets exist.
11. Setup command `pnpm admin:create` for the first admin.

Done-when checklist (from `15-build-phases.md`):

- [ ] `staging` deploys from CI and loads — _needs Cloudflare + Neon credentials (see Open questions)_
- [x] First admin can be created with a setup command and can sign in with 2FA (e2e)
- [x] A customer can sign up and verify email (mocked email in dev) (e2e + integration)
- [x] Changing a color token in the DB changes the site after revalidation (e2e)
- [x] `/admin` is blocked for guests and customers (e2e + unit)

## Phase 2 — Settings and master data (plan)

1. Admin UI kit: page header, form sections, fields (text, number, select, switch, colour with contrast, list, checkbox list, icon picker), side panel, confirm dialog, empty state, drag-to-reorder list, portalled UI kept inside the admin theme.
2. Master data (Setup): property types, facilities, badges, POI types with create/edit in a side panel, drag to reorder, usage counts, safe delete and "merge into…".
3. Maps: MapLibre map, pin picker and polygon drawing (tile key from settings, keyless fallback style).
4. Locations tree (country -> building) with map pin and boundary, SEO block; POIs with map point and "Import from Google" (stub without a key); developers; agent profiles.
5. Media library on R2 (local folder in dev): signed uploads, processing job (dimensions, colour, re-encode/EXIF strip), folders, alt text, crops, usage, replace, bulk delete unused; media picker.
6. Settings screens for all 12 groups (integrations as stubs with test buttons), branding editor with live preview and contrast checker.
7. Admin users (invite, deactivate, reset 2FA, API tokens), audit log viewer, Jobs page.

Done-when checklist:

- [ ] Every master data type can be created, edited, ordered, merged and safely deleted
- [ ] Uploads go to R2 and show in the media library with alt text
- [ ] Settings validate and save; contrast checker works
- [ ] Audit log shows every change with before/after

## Done

- Read the whole spec. Checked the toolchain on this machine (Node 24, pnpm 12, no Docker/Postgres).
- Scaffold (Next 16.4, TS strict, Tailwind v4, ESLint + Prettier).
- Database layer: Drizzle schema (auth, settings, secrets, audit log, rate limits, jobs, email log, agents, media), PostGIS/pgvector column types, migrations (extensions, core, append-only audit), `pnpm db:start | db:migrate | db:reset`.
- Settings: Zod schemas with defaults for all 12 groups (04-settings.md), lenient read (bad field falls back alone), strict admin input (unknown keys rejected), cached loader (`'use cache'` + `settings:<group>` tags), save helper with audit diff; encrypted secrets (AES-256-GCM) with masked status; audit helper (changed keys only, secrets redacted, truncated IPs).
- Tests: Vitest unit + integration projects; integration uses an in-memory PGlite with a cached migrated snapshot (`.data/test-db-<hash>.tar.gz`). 40 tests passing.
- Auth (Better Auth 1.7): customer sign-up with email verification (branded email, queued `email.send` job, mocked when no provider), sign-in with "remember me", password reset, optional Google sign-in (env + Security toggle), admin TOTP 2FA enrolment and challenge with backup codes, admin 12h sessions, deactivated accounts refused, login lockout (5 failures -> 15 min) + Better Auth rate limits, Turnstile on sign-up/sign-in/reset, `pnpm admin:create` setup command, permission table + `requireAdmin` / `requireAdminPage` / `requireCustomer` guards, `adminAction()` wrapper (auth -> strict Zod -> handler), read-only demo viewer flag, Edge middleware (cookie-based redirect + current path), header account menu, admin user menu + per-admin theme.
- Background jobs: `job_runs` table, registry, `enqueue()` with dedupe keys and drivers (`queue` on Workers, `inline` via `after()`, `manual` for tests), runner with atomic claim, exponential backoff, dead-letter after max attempts, stuck-job requeue, retry.
- Rate limiting: fixed-window counters in Postgres (forms 5/min, chat 20/min + 200/day, login lockout).
- Health check `/api/health`; internal revalidation `/api/internal/revalidate` (shared secret).
- E2E: Playwright with its own server (`scripts/e2e-server.ts`: in-memory DB from the migrated snapshot + Next in `.next-e2e`). 5 flows pass: guests blocked from /admin and /account; customer sign-up -> email -> verify -> /account, kept out of /admin; first admin via setup command -> 2FA enrolment -> sign-out -> sign-in with TOTP; colour token change -> revalidate -> site restyled; internal endpoint needs the secret.
- Cloudflare: `wrangler.jsonc` (production + staging: R2, Queues + DLQ, Hyperdrive, Durable Objects for the tag cache and revalidation queue, Images, Browser Rendering, every-minute cron), `open-next.config.ts`, custom worker (`worker/index.ts`) forwarding queue messages and cron ticks to internal routes; cron dispatcher that schedules tasks in the agency time zone; `pnpm dev:cron`.
- CI (GitHub Actions): lint, types, format, migration drift check, unit + integration tests, dependency audit, Playwright against a production build, Workers bundle build on Linux, staging deploy (migrate -> build -> deploy -> health check) once secrets exist.
- `next build` verified locally (public pages are partial prerenders, admin is dynamic). The OpenNext bundling step needs Linux/WSL (symlinks), so CI builds it.
- Phase 2 (in progress): admin UI kit; master data for property types, facilities, badges and POI types (side-panel editor, drag reorder, usage counts, safe delete, merge), audited and cache-tagged; integration + e2e tests.
- UI foundation: Desert Modern tokens as Tailwind v4 theme variables, injected from Branding settings at runtime (`html:root`), shadcn/ui mapped onto them; admin light/dark scope; type scale and container utilities; 12 self-hosted fonts selectable in Branding; contrast helpers (WCAG); i18n dictionaries (site, account, admin); shells: site header/footer, account (menu/tabs), admin (sidebar, top bar with assistant input, theme toggle).

## In progress

- Phase 1 scaffold.

## Next

- Phase 1 items 2–11.

## Decisions (made by me, per spec 01 §5 "small decisions")

1. **Working mode.** The owner asked (chat, 2026-10-20) for the whole project to be built end to end with feature-by-feature commits and pushes, reviewing and testing everything myself. So I write each phase plan here and proceed without waiting for approval between phases.
2. **Local database = PGlite.** This machine has no Docker or PostgreSQL. `@electric-sql/pglite` 0.5.10 is PostgreSQL 18.6 compiled to WASM and supports `postgis`, `vector`, `pg_trgm` and `unaccent`. `pnpm db:start` exposes it over the normal Postgres wire protocol (`@electric-sql/pglite-socket`), so the app uses the same `pg` driver locally and on Workers. Verified: ST_DWithin (geography), ST_Within/ST_Contains with GeoJSON polygons, HNSW cosine search, trigram similarity, `unaccent`, full-text search, concurrent connections and transactions. Production stays on Neon via Hyperdrive. PGlite is a dev/test dependency only.
3. **DB driver = `pg` (node-postgres).** That is what the OpenNext Cloudflare docs use with Hyperdrive. On Workers a small pool is created per request (`maxUses: 1`) because I/O objects cannot be shared across requests; in Node a single pool is reused.
4. **Caching model = Next.js 16 Cache Components.** `cacheComponents` + `partialPrefetching` are the Next 16.4 defaults and OpenNext lists composable caching (`'use cache'`) and PPR as supported. Public data functions use `'use cache'` + `cacheLife` + `cacheTag`; mutations call `updateTag`/`revalidateTag`. This gives the per-entity revalidation the spec asks for (listing → its search results → its project page).
5. **`middleware.ts`, not `proxy.ts`.** Next 16 renamed middleware to proxy, but proxy only runs on Node.js and OpenNext does not support Node middleware yet. Edge `middleware.ts` is still supported and is what spec 01 asks for.
6. **Library versions.** Locked-stack tools use their current versions (Next 16.4.2, React 19.3, Tailwind 4.3, Drizzle 0.45, Better Auth 1.7, OpenNext 1.20, Tiptap 3). Where a new major shipped very recently, I use the previous major, which is still maintained: TypeScript 5.9 (Next's template pins `^5`; TS 7 is the new native compiler), ESLint 9, Vitest 4, TanStack Table 8, MapLibre GL 5, `@hookform/resolvers` 5.
7. **`tsx`** runs TypeScript scripts (migrate, seed, setup commands). Dev dependency only.
8. **Single tenant `agency_id`.** Every main table has `agency_id` (uuid). Its value comes from `AGENCY_ID` in the environment. There is no `agencies` table (out of scope); adding one later is a small migration.
9. **IDs.** UUID v7 generated in app code (`lib/ids.ts`), so ids are known before insert (needed for audit `entity_id` and for linking rows in one transaction).
10. **Line endings.** `.gitattributes` forces LF; `core.autocrlf=false` in this clone.
11. **Own PGlite wire bridge (`scripts/pglite.ts`) instead of `@electric-sql/pglite-socket`.** The socket server forwards an extra ReadyForQuery that PGlite's backend emits after an error in an extended-protocol message, so every later result on that connection is shifted by one (reproduced with a unique violation and with a trigger error). The bridge buffers each client batch up to Sync, skips the rest of a failed batch until Sync, forwards ReadyForQuery only for Sync/Query, and gives the session to one connection while it is inside a transaction (from the ReadyForQuery status byte). Verified: error sequences, aborted transactions, pipelining, a pool with mixed errors, crash recovery after a hard kill.
12. **Search helpers in SQL.** `lintel_unaccent()` / `lintel_normalize()` are IMMUTABLE wrappers (unaccent itself is only STABLE) so they can be used in generated columns and trigram indexes.
13. **Vitest uses Vite's native `resolve.tsconfigPaths`** (no extra plugin).
14. **Accent on accent-soft is for icons only.** With the Desert Modern defaults, terracotta text on its soft tint is 4.44:1 (below the 4.5:1 rule). Accent icons on the tint pass the 3:1 UI-graphics rule; badge/label text on the tint uses ink. The branding contrast report checks both pairs.
15. **Form-control borders** use a mix of the muted text colour (≥ 3:1, WCAG 1.4.11) instead of the decorative border token (~1.3:1 on white).
16. **shadcn/ui 4 (Radix base, `rtl: true`)** so generated components use logical properties. shadcn's `accent` (hover background) is replaced by `muted` in components because `--color-accent` is the spec's terracotta token. Toasts do not use next-themes (light site, admin passes its theme).
17. **Audit log is append-only in the database** (trigger blocks UPDATE/DELETE/TRUNCATE), not only in app code. Test clean-up uses `session_replication_role = replica`.

## Data model changes (vs `05-data-model.md`)

| Table                         | Change                                                                           | Why                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| users                         | + `read_only`                                                                    | Demo viewer account (16 §3) is a flag, not a role                                 |
| users                         | + `preferred_contact`, `marketing_consent`, `marketing_consent_at`, `invited_by` | Customer profile + consent with date (12 §2, 14 §3); admin invites (03)           |
| two_factors, auth_rate_limits | new                                                                              | Better Auth two-factor plugin and login rate-limit storage                        |
| api_tokens                    | new                                                                              | Per-admin MCP tokens, hashed (10 §4)                                              |
| audit_log                     | + `confirmed_by`                                                                 | AI actions record the confirming admin (10 §3)                                    |
| rate_limits                   | new                                                                              | App rate limits for forms/chat/tools (14 §2)                                      |
| job_runs                      | new                                                                              | Jobs page: recent runs, failures, retry (13 §2)                                   |
| email_log                     | new                                                                              | Email status tracking; dev outbox when no provider                                |
| agents                        | + SEO block, `reply_time_text`, `last_assigned_at`                               | Agent pages have an SEO panel (08 §6); "usually replies in…" (06 §5); round robin |
| media                         | + `kind`, `status`, `processing_error`                                           | Upload processing job state                                                       |

## Open questions

1. **Cloudflare and Neon accounts.** Deploying staging/production needs: a Cloudflare account (Workers paid plan for Queues + Browser Rendering), an R2 bucket, a Hyperdrive config pointing at a Neon database, and GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `STAGING_DATABASE_URL`. Until they exist, CI runs everything except the deploy job, and everything works locally.
