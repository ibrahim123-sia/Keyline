# 14 — Non-functional Requirements

## 1. Performance
- Public pages server-rendered and cached at the edge with tag-based revalidation
- Targets on a mid-range phone, 4G: LCP < 2.5s, INP < 200ms, CLS < 0.1 (Core Web Vitals "good")
- Search results response (server) < 300ms for typical filters; autocomplete < 150ms
- Images: responsive sizes, modern formats, lazy below the fold, priority for the hero/cover only
- Map loads only when visible or when the user opens it on phone
- Chat widget script loads after the page is interactive
- No client-side data fetching for first paint of public pages
- Database: indexes from `05-data-model.md`; check slow queries with `EXPLAIN` before closing each phase

## 2. Security
- Server-side auth and permission check on every admin route, action, route handler and AI tool
- Zod validation everywhere; reject unknown fields
- CSRF protection for forms (built into server actions; check route handlers)
- Rate limits (per IP + visitor id): forms 5/min, chat 20 messages/min and 200/day, autocomplete 30/s, login 5/min then lockout 15 min
- Cloudflare Turnstile on public forms and signup
- Rich text sanitized on save (allowlist) and on render
- Uploads: signed R2 URLs, MIME and size checks, image re-encode, EXIF strip, no SVG uploads from the public
- Secrets encrypted at rest; masked in UI; never sent to the client
- Webhooks: signature verification (WhatsApp, Resend, social forms); replay protection with timestamps
- Security headers: CSP (allow only needed domains), HSTS, X-Frame-Options deny (except preview routes), Referrer-Policy, Permissions-Policy
- Admin 2FA, session timeout, re-auth for sensitive actions
- Audit log for every admin and AI write; logs are append-only
- AI: tool allowlists per assistant; write tools blocked unless confirmed; hard-coded deny list (`10-ai.md`)
- Dependency audit in CI

## 3. Privacy
- Cookie consent with categories; no analytics or marketing tags before consent
- Visitor id cookie is first-party; IPs stored truncated
- Customer self-service export and deletion (`12-customer-area.md`)
- Data retention settings applied by a nightly job
- Marketing consent stored with date and source; unsubscribe in every marketing email
- Privacy policy page required before go-live (setup checklist)

## 4. Accessibility (WCAG 2.2 AA)
- Real `button`, `a`, `input` + `label` elements; no click handlers on divs
- Visible focus rings; skip-to-content link; logical heading order
- Contrast ≥ 4.5:1 text, ≥ 3:1 large text and UI parts (branding editor enforces this)
- All images have alt text; decorative ones have empty alt
- Map has a list alternative; drawn area can be cleared by keyboard
- Forms: errors announced, linked to fields; no time limits
- Tested with keyboard only and a screen reader on the main flows

## 5. Reliability and operations
- Environments: local, staging (noindex, test keys), production
- CI: lint, type check, unit tests, Playwright on staging deploy, migration check
- Database migrations run in CI before deploy; backups by Neon (point-in-time)
- Error tracking (Sentry or Cloudflare logs) with release tags
- Structured logs with request id; no personal data in logs
- Health check route; admin "System" page with job queue status, integration status, AI spend this month
- Graceful fallbacks: if Google, WhatsApp or AI is down, the site still works and forms still create leads

## 6. Testing
**Unit (Vitest):** money and unit conversion, mortgage and ROI maths, payment plan totals, attribution channel rules and first/last touch, duplicate matching, assignment rules, permission checks, slug + redirect creation, alert matching, score rubric parsing.
**Integration:** server actions with a test database; webhooks with recorded payloads; AI tools with a mocked provider.
**End to end (Playwright):**
1. Guest searches with filters and map, opens a property, sends an inquiry → lead appears in admin with attribution
2. Guest books a video tour → viewing in calendar, emails sent (mocked)
3. Customer signs up, saves a home and a search, gets a price-drop alert after admin lowers the price
4. Admin creates a listing with photos, pin, POIs (mocked API), payment plan, SEO → publishes → visible in search and sitemap
5. Admin builds a page with sections, sets it as home, edits header menu and footer
6. Admin assistant proposes a price change → admin confirms → listing updated, audit log entry
7. Customer assistant answers about a listing and books a viewing (mocked model with fixed responses)
8. Valuation request with fewer than 3 comparables shows "not enough data" and creates a task
**AI evals:** `10-ai.md` §6.

## 7. Documentation
- `README.md`: what Propel is, screenshots, features list, stack, local setup, env vars, deploy to Cloudflare, seed data, demo logins, MCP setup
- `docs/` kept updated when behaviour changes
- `PROGRESS.md` and a `CHANGELOG.md`
