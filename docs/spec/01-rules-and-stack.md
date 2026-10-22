# 01 — Rules, Tech Stack and Way of Working

## 1. Hard rules

1. **Write everything from scratch.** Do not copy code, prompts, data, screens or copy from any other project or client.
2. **Demo data is fictional.** Agency, agents, customers, leads and prices are made up. Real public places (malls, metro stations, beaches, airports, public schools and hospitals) may be used as POIs with real coordinates.
3. **No hard-coded content on the public site.** Every page, section, menu, footer link, logo, color, font, phone number, email, address and social link comes from the database and is editable in the admin.
4. **No hard-coded market.** Currency, area unit, distance unit, permit label, rent payment options, country, cities and time zone come from settings (`04-settings.md`).
5. **English only for now, but i18n-ready.** All UI strings live in one dictionary file per area (site, account, admin). Layouts must not break if `dir="rtl"` is set later. Use logical CSS properties (`margin-inline`, `padding-inline`, `inset-inline-start`) instead of left/right where you can.
6. **TypeScript `strict` everywhere.** No `any` without a comment explaining why.
7. **Validate everything on the server with Zod**, including server actions, route handlers, webhooks and AI tool inputs.
8. **AI never changes data without a confirm.** Every AI write action shows a preview and waits for an admin to confirm. AI can never delete anything, change settings or manage users.
9. **AI never invents facts.** Customer-facing AI only answers from the agency's own data. If it does not know, it says so and offers a human.
10. **Never commit secrets.** Keep `.env.example` complete and commented.
11. **Every admin change is audited** (who, what, when, before and after).
12. **Keep `PROGRESS.md` current:** done, in progress, next, open questions, decisions you made yourself.
13. **Before closing any phase:** lint, type check, unit tests and Playwright tests all pass.

## 2. Tech stack (locked)

Check current official docs before setting up each tool. Versions change quickly. If a doc says something different from this file, tell me before you change course.

| Part | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16**, App Router, React Server Components, Server Actions, TypeScript | One app for public site, customer area and admin |
| Hosting | **Cloudflare Workers** via **OpenNext** (`@opennextjs/cloudflare`) | Do not use vinext (beta, no build-time prerendering, and this site depends on SEO). OpenNext does not support Node.js middleware yet: keep `middleware.ts` small and Edge-safe |
| Database | **PostgreSQL on Neon** | Extensions: `postgis`, `vector` (pgvector), `pg_trgm`, `unaccent` |
| DB connection | **Cloudflare Hyperdrive** | Pool size small (Workers allow few concurrent connections) |
| ORM | **Drizzle ORM** + Drizzle Kit | Migrations in git. PostGIS and vector columns via custom types |
| Auth | **Better Auth** | Email + password, email verification, password reset, Google sign-in for customers (optional setting). Roles: `admin`, `customer` |
| UI | **Tailwind CSS v4** + **shadcn/ui** | Tokens as CSS variables (`02-design-system.md`) |
| Forms | React Hook Form + Zod | Same Zod schema on client and server |
| Tables (admin) | TanStack Table | Server-side paging, sort, filter |
| Rich text | **Tiptap** | Output saved as JSON + sanitized HTML |
| Drag and drop | dnd-kit | Page builder sections, photo order, menu order, pipeline board |
| Files | **Cloudflare R2** | Signed upload URLs. Image resizing through Cloudflare |
| Background work | **Cloudflare Queues** + **Cron Triggers** | See `13-integrations-and-jobs.md` |
| Search | Postgres full-text (`tsvector`) + `pg_trgm` | Typo-tolerant autocomplete. No separate search service |
| Maps (display) | **MapLibre GL JS** + a vector tile provider (MapTiler or similar, key in settings) | Draw-on-map with a draw plugin |
| Maps (data) | **Google Maps Platform**: Geocoding, Places (nearby), Routes (distance and travel time) | Called only from background jobs and cached |
| PDF | **Cloudflare Browser Rendering** | HTML template to PDF for brochures and reports |
| OG images | Satori-based generation on Workers | Dynamic share cards |
| AI | **TypeScript AI SDK** with tool calling, through **Cloudflare AI Gateway** | Provider behind an interface so the model can be swapped |
| Embeddings | pgvector in the same Postgres | Hybrid search: vector + filters + full-text |
| MCP | MCP server on Cloudflare exposing admin tools | Same confirm rule as the admin assistant |
| Email | **Resend** + React Email templates | |
| WhatsApp | **Meta WhatsApp Cloud API** | Webhooks in, template and session messages out |
| Calendar | Google Calendar API | Two-way sync for agent profile calendars |
| Analytics | Own first-party events + optional GA4 / GTM / Meta Pixel IDs from settings | Loaded only after cookie consent |
| Charts (admin) | Recharts | |
| Tests | **Vitest** (unit) + **Playwright** (end to end) | |
| Lint / format | ESLint + Prettier | |

Do not add Python, a second database, Redis or a separate search engine unless I approve it.

## 3. Folder structure

```
/app
  /(site)            public website routes
  /(account)         customer area routes
  /admin             admin portal routes
  /api               route handlers: webhooks, OG images, sitemap, AI streaming, uploads
/components
  /ui                shadcn components
  /site              public components
  /admin             admin components
  /sections          page builder section renderers (one file per section type)
/features            one folder per module, each with: schema.ts, queries.ts, actions.ts, components/
  /settings /locations /master-data /properties /projects /media /cms /blog /seo
  /leads /attribution /viewings /inbox /reports /customers /tools /ai /notifications
/db
  schema/            Drizzle schema split by module
  migrations/
  seed/              seed scripts and presets
/lib                 auth, permissions, settings loader, tokens, money, units, dates, i18n, validation
/jobs                queue consumers and cron handlers
/mcp                 MCP server
/emails              React Email templates
/tests               unit and e2e
```

## 4. Coding conventions

- Server-first: fetch data in Server Components, mutate with Server Actions. Client components only where interaction needs them.
- Every Server Action: check auth and permission first, validate with Zod, write audit log, revalidate the right cache tags.
- Money: store as integer minor units (e.g. fils / cents) plus currency code. Never floats for money.
- Area: store in square metres internally, show in the unit from settings. Same for distances (store metres).
- Dates: store UTC, show in the agency time zone.
- Slugs: unique per content type, auto-generated from title, editable, old slugs create a 301 redirect automatically.
- Soft delete (`deleted_at`) for listings, pages, posts, leads. Admin can restore from a Trash view for 30 days.
- Use cache tags so editing a listing only revalidates that listing, its search results and its project page.

## 5. How to work with me

- Start each phase with a short plan and wait for my OK.
- Ask before: adding a library or service not listed here, a big data-model change, skipping or cutting a feature.
- Small decisions: decide, then log them in `PROGRESS.md` under "Decisions".
- Commit often, one feature per commit, clear messages.
- If you are unsure about an API, version or limit, check the official docs. Do not guess.
- At the end of each phase, give me: what was built, how to test it, screenshots of new screens, open questions.
