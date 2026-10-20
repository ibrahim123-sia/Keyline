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
- [ ] First admin can be created with a setup command and can sign in with 2FA
- [ ] A customer can sign up and verify email (mocked email in dev)
- [ ] Changing a color token in the DB changes the site after revalidation
- [ ] `/admin` is blocked for guests and customers (tested)

## Done

- Read the whole spec. Checked the toolchain on this machine (Node 24, pnpm 12, no Docker/Postgres).

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

## Data model changes (vs `05-data-model.md`)

_None yet._

## Open questions

1. **Cloudflare and Neon accounts.** Deploying staging/production needs: a Cloudflare account (Workers paid plan for Queues + Browser Rendering), an R2 bucket, a Hyperdrive config pointing at a Neon database, and GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `STAGING_DATABASE_URL`. Until they exist, CI runs everything except the deploy job, and everything works locally.
