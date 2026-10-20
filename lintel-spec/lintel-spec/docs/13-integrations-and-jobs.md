# 13 — Integrations, Background Jobs and Notifications

## 1. Integrations

Each integration lives in `/features/integrations/<name>` behind an interface, so it can be mocked in tests and swapped later. Keys are stored encrypted (`secrets`). Every integration has a "Test connection" button and shows its last error in Settings.

### WhatsApp (Meta Cloud API)
- Webhook route verifies the signature; handles messages, statuses (sent, delivered, read, failed) and errors
- Inbound message → find or create contact by phone → find open conversation → AI agent or human (`10-ai.md`)
- Outbound: session messages inside 24h; templates outside. Templates used: lead auto-reply, viewing confirmation, viewing reminder, viewing reschedule, price drop alert (opt-in), new match alert (opt-in), agent new-lead notice
- Template names and their variables configured in settings
- Click-to-WhatsApp links on the site include a short ref code (e.g. `[HD-2041·k3f9]`) to match the chat to the visitor and listing

### Email (Resend + React Email)
Templates (all branded with tokens and logo, plain-text version included):
- Customer: email verification, password reset, inquiry received, viewing confirmed / reminder / rescheduled / cancelled / feedback request, valuation received (+ estimate), listing request received, brochure link, ROI report, new matches (instant / digest), price drop, status change, account deleted, data export ready
- Internal: new lead, lead not answered, new viewing, viewing cancelled, valuation request, listing request, daily summary, weekly report, integration error
- Inbound email: a lead reply-to address per lead (`lead+<id>@<domain>`) routed via email webhook into the timeline (optional, configurable)

### Google
- **Maps Platform:** Geocoding (address → point), Places nearby (POI import), Routes (distance and travel time). Server key only, used from jobs
- **Calendar:** OAuth per agent profile (connected by an admin), read free/busy, write viewing events, two-way updates via push notifications or polling job
- **Analytics / GTM:** IDs injected only after consent

### Portals (connector interface)
`PortalConnector { fetchLeads(since), normaliseLead(raw), pushListing?(listing) }`
- Demo build: **email parsing connector** (portal lead emails forwarded to an inbox; parser extracts name, phone, email, listing ref, message) and **CSV import**
- Real API connectors (e.g. Property Finder, Bayut, Dubizzle for UAE; others for other markets) are added when an agency gives its own credentials. Keep a stub class for each with TODOs, not fake data
- Portal leads dedupe like any other lead

### Social lead forms
- Webhook endpoints for Meta Lead Ads, TikTok Lead Generation, Google Ads lead forms
- Secret / signature check, field mapping screen in settings, campaign and ad ids saved as attribution

### Map tiles
Client-side tile key from settings (MapTiler or similar). Fallback style if missing.

## 2. Background jobs

Queues (Cloudflare Queues) for event-driven work; Cron Triggers for scheduled work. Every job: idempotent, retries with backoff (max 5), dead-letter queue, logs, and an admin "Jobs" page (Admin → Settings → System) showing recent runs, failures and a retry button.

### Queue jobs
| Job | Trigger | Does |
|---|---|---|
| `poi.compute` | pin moved, recalculate | Find nearby POIs, call Routes, save `property_pois` |
| `embeddings.upsert` | publish / update | Rebuild chunks and vectors |
| `embeddings.remove` | unpublish / delete | Remove vectors |
| `brochure.render` | listing changed, on demand | Render PDF to R2 |
| `og.render` | content changed | Pre-render share image |
| `alerts.new_listing` | listing published | Match saved searches, send instant alerts, queue digests |
| `alerts.price_drop` | price lowered | Notify savers and matching searches |
| `alerts.status_change` | status changed | Notify savers |
| `lead.process` | lead created | Dedupe, assign, notify, auto-reply, start timer |
| `lead.score` | chat ended, lead updated | AI summary and score |
| `media.process` | upload | Dimensions, colour, HEIC convert, EXIF strip |
| `media.fetch_url` | CSV import with photo URLs | Download to R2 |
| `import.properties` | CSV import confirmed | Create drafts in batches |
| `whatsapp.send` / `email.send` | any message | Send with retries, store status |
| `calendar.sync` | viewing changed | Push to Google Calendar |
| `ai.blog_draft` | admin request | Draft post |

### Cron jobs
| Schedule | Job |
|---|---|
| Every minute | Response timer: find leads past the limit, alert, mark |
| Every 10 min | Viewing reminders due; WhatsApp window expiry updates |
| Every 15 min | Calendar busy-time refresh (if push not available) |
| Hourly | Close idle chats and summarise; scheduled posts and pages go live |
| Daily 06:00 agency time | Daily digests for saved searches; daily summary email to admins; auto badges expire (New, Price reduced); verification expiry → "Needs verification"; stale listing suggestions |
| Daily 02:00 | Roll up `visitor_events` into `property_daily_stats` and `daily_metrics`; data retention clean-up |
| Weekly (Mon) | Weekly digests; weekly report email; SEO crawl for broken links and thin pages; chat topic clustering |
| Monthly (1st) | `area_price_stats` computation; POI recompute for listings older than 90 days; exchange-rate reminder to admin |

## 3. Notifications matrix

| Event | Admins | Agent profile | Customer |
|---|---|---|---|
| New lead | email (+ WhatsApp if set) | email + WhatsApp | auto-reply (email/WhatsApp) |
| Lead not answered in X min | email + WhatsApp + dashboard alert | WhatsApp | — |
| Viewing booked | email | email + WhatsApp + calendar | email + WhatsApp + .ics |
| Viewing reminder | — | WhatsApp 2h before | email 24h + WhatsApp 2h |
| Viewing cancelled / rescheduled | email | email + WhatsApp | email + WhatsApp |
| Viewing done | — | — | feedback request |
| Valuation / listing request | email | email + WhatsApp | confirmation (+ estimate) |
| New match / price drop / status change | — | — | per customer settings |
| Integration error | email + banner in admin | — | — |
| Daily summary | email at set time | — | — |
Every notification type can be turned off in Settings → Notifications.
