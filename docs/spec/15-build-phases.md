# 15 — Build Phases

Finish each phase fully before starting the next. At the start of a phase, write a short plan and wait for approval. At the end: lint, types, tests pass; `PROGRESS.md` updated; tell me what was built, how to test it, and show screenshots.

---

## Phase 1 — Foundation
**Build:** repo setup (Next.js 16, TS strict, Tailwind v4, shadcn/ui, ESLint, Prettier, Vitest, Playwright); Cloudflare Workers deploy with OpenNext (staging + production configs); Neon database with extensions; Hyperdrive; Drizzle setup and core schema (users, settings, secrets, audit_log, agents, media); Better Auth (admin + customer roles, admin 2FA); permission helpers; settings loader with cache; design tokens as CSS variables from settings; base layouts (site header/footer shells, admin sidebar/topbar); i18n string dictionaries; audit log helper; CI pipeline.
**Done when:**
- [ ] `staging` deploys from CI and loads
- [ ] First admin can be created with a setup command and can sign in with 2FA
- [ ] A customer can sign up and verify email (mocked email in dev)
- [ ] Changing a color token in the DB changes the site after revalidation
- [ ] `/admin` is blocked for guests and customers (tested)

## Phase 2 — Settings and master data
**Build:** all Settings tabs from `04-settings.md` (integrations can be stubs with test buttons); locations tree with map; property types; facilities; badges; POI types; POIs (with Google import as a stub if no key); developers; agent profiles; media library on R2 with signed uploads and processing job; admin users and audit log viewer; Jobs page.
**Done when:**
- [ ] Every master data type can be created, edited, ordered, merged and safely deleted
- [ ] Uploads go to R2 and show in the media library with alt text
- [ ] Settings validate and save; contrast checker works
- [ ] Audit log shows every change with before/after

## Phase 3 — Properties and projects
**Build:** property list (table, filters, saved views, bulk actions); full property editor (`07-properties-and-projects.md`) with autosave, media, map pin, payment plan builder, facilities, badges, trust, SEO panel, completeness score, publish rules; price history; auto badges; POI distance job with Google (and fallback); projects with unit types and "create listings from unit types"; developers; CSV import/export.
**Done when:**
- [ ] A listing can be fully created and published with all fields
- [ ] Moving the pin computes POIs and travel times (or straight-line fallback)
- [ ] Payment plan must total 100% to publish
- [ ] Price change writes history and adds "Price reduced"
- [ ] CSV import creates drafts with a validation preview

## Phase 4 — Public site core
**Build:** home rendered from sections (seed content); search pages with all filters in the URL; list + map with pins, clusters and hover sync; autocomplete (typo-tolerant); property page with every block from `06-public-website.md`; project page; developer and agent pages; currency switcher; similar homes; recently viewed; 404; cookie banner; Turnstile.
**Done when:**
- [ ] All public routes render server-side with real seed data
- [ ] Filters, sort and paging work and are shareable via URL
- [ ] Phone layouts work (map toggle, filter sheet, bottom contact bar)
- [ ] Core Web Vitals targets met on the property page in a Lighthouse mobile run

## Phase 5 — CMS and SEO
**Build:** page builder with all section types, live preview, revisions, templates, scheduling; menus and footer editors; announcement bar; blog with categories, tags, scheduling; area guides; testimonials; FAQs; SEO panel everywhere; sitemap index; robots; JSON-LD; title patterns; redirects manager with automatic slug redirects; 404 monitor; SEO landing pages with thin-page noindex; SEO report.
**Done when:**
- [ ] Admin can build a new page from sections, publish it and add it to the header menu without code
- [ ] Changing a slug creates a 301
- [ ] Sitemap, robots and JSON-LD validate (Google Rich Results test passes for a property page)

## Phase 6 — Leads and CRM
**Build:** visitor id + attribution middleware; event tracking; all forms and lead sources from `09-leads-and-crm.md` (portal = email parsing + CSV; social forms = webhooks); lead processing pipeline (dedupe, assign, notify, auto-reply, timer); leads list + Kanban; lead page with timeline, composer, matching listings, send properties; contacts and merge; viewings booking flow (site) and calendar (admin) with Google Calendar sync; inbox (web chat shell + WhatsApp + email) with takeover and approval queue; UTM link builder and QR; email templates; WhatsApp integration; notifications.
**Done when:**
- [ ] Every source in the table creates a lead with the right `source` and attribution
- [ ] First and last touch behave as specified (unit tests)
- [ ] Duplicate leads merge correctly
- [ ] A lead unanswered past the limit triggers an alert
- [ ] Tour booking shows real free slots and syncs to Google Calendar

## Phase 7 — Customer area
**Build:** account pages, saved homes and lists, saved searches with polygon, compare saved to account, tours, inquiries, chats, profile, notifications, privacy export/delete; alert jobs (instant, daily, weekly, price drop, status change) and emails.
**Done when:**
- [ ] Guest save → signup → save completes
- [ ] Publishing a matching listing sends an instant alert once
- [ ] Lowering a saved home's price sends a price-drop email
- [ ] Data export and account deletion work

## Phase 8 — Tools
**Build:** mortgage calculator + pre-approval; ROI simulator + PDF report; compare page and tray; brochure PDF; valuation with comparables; list-your-property; price trends with monthly job and admin-entered data; draw-your-area; commute time search; dynamic share cards; verified badge expiry.
**Done when:**
- [ ] Maths unit tests pass (mortgage, ROI, IRR, yields)
- [ ] Brochure renders all 4 pages with branding
- [ ] Polygon and commute filters return correct results
- [ ] Share card shows correctly in the WhatsApp preview checker

## Phase 9 — AI
**Build:** AI service layer, gateway, usage logging, spend limit; embeddings pipeline + hybrid search; customer assistant on web with all tools, lead capture, booking, hand-over, summaries and scoring; WhatsApp agent; admin assistant (ask, suggest, act) with the confirm flow and hard blocks; dashboard suggestion cards; AI helpers (descriptions, titles, SEO, alt text, blog draft, valuation, listing from text); MCP server with tokens; prompt files; eval set.
**Done when:**
- [ ] Eval set passes (grounded answers, no invented listings, correct hand-over)
- [ ] Customer assistant books a real viewing end to end
- [ ] Every admin AI write action needs confirm and appears in the audit log
- [ ] MCP server works from an MCP client with a token, and write actions stay pending until confirmed

## Phase 10 — Reports, polish, launch
**Build:** dashboard KPIs; all reports from `09-leads-and-crm.md` §7 with CSV/PDF export and weekly email; System page; accessibility pass; performance pass; security headers and CSP; full Playwright suite; seed demo data and US preset (`16-seed-and-demo.md`); README with screenshots; demo video script.
**Done when:**
- [ ] All e2e flows in `14-non-functional.md` pass on staging
- [ ] Lighthouse: Performance ≥ 90, Accessibility ≥ 95, SEO 100 on home, search and property pages (mobile)
- [ ] Switching to the US preset changes currency, units and labels with no code changes
- [ ] README and demo logins ready
