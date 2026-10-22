# 04 — Settings (Admin → Settings)

Everything that changes per agency lives here. Settings are stored as typed JSON per group in the `settings` table, validated with Zod, cached, and revalidated on save. Each group is its own tab.

## 1. General
- Agency name, legal name, short description (used in footer and SEO)
- Logo (light and dark versions), favicon, app icon
- Licence / registration number (shown in footer)
- Default language (English), RTL toggle (disabled until a second language exists)
- Time zone, date format, first day of week
- Maintenance mode (shows a simple page to the public, admins can still browse)

## 2. Branding (design tokens)
- All color tokens from `02-design-system.md` with color pickers
- Contrast checker: warn if any text/background pair fails 4.5:1
- Display font and body font (pick from a list of Google Fonts)
- Corner style: soft (default) / sharper
- Live preview panel showing a property card, buttons and a heading
- "Reset to Desert Modern" button

## 3. Market
- Base currency (ISO code, symbol, symbol position, decimals)
- Visitor currencies for the switcher (list) with exchange rates set manually, and "last updated" date. Rates are only for display; the base currency is the real price
- Area unit: sq.ft or sq.m
- Distance unit: km or miles
- Permit / licence field: on or off, label text (e.g. "Permit no."), required on publish yes/no
- Rent price shown as: per year or per month
- Rent payment options: list of allowed number of payments (e.g. 1, 2, 4, 6, 12) and a "monthly payment available" toggle
- Ownership types list (e.g. Freehold, Leasehold)
- Furnishing options list
- Country, phone country code, phone format
- Default map center and zoom
- Mortgage calculator defaults: down payment %, interest rate, years, max loan-to-value
- ROI simulator defaults: service charge per area unit, management fee %, occupancy %

## 4. Contact
- Main phone, WhatsApp number, email, office address (with map pin), opening hours
- Social links (Instagram, Facebook, LinkedIn, YouTube, TikTok, X)
- Where new lead notifications go (emails, WhatsApp number)

## 5. Leads and CRM
- Pipeline stages (name, order, color, "counts as won/lost") — editable
- Lead types list (buyer, tenant, seller, landlord, investor) — editable
- Lost reasons list — editable
- Response time alert: minutes before alert (default 10), who gets it
- Assignment rule: by area of the listing's agent / round robin / manual
- Duplicate matching: by email, by phone, both
- Follow-up defaults: auto task "Follow up" after X days with no activity
- Portal email inboxes to parse (address per portal)

## 6. Viewings
- Default viewing length (30 min), buffer between viewings (15 min)
- Booking window (how many days ahead), minimum notice (hours)
- Working hours per weekday, holidays
- Video tour tools: Google Meet / Zoom link / WhatsApp video (choose)
- Reminders: to customer X hours before (email + WhatsApp), to agent

## 7. SEO
- Site title pattern (e.g. `%page% | %agency%`)
- Default meta description, default OG image
- Title patterns for listings, projects, areas, posts (with variables: `%type%`, `%beds%`, `%area%`, `%price%`)
- Google Search Console verification code, Bing verification
- Robots: allow / block indexing (block for staging)
- Organisation schema details (name, logo, phone, address, social profiles)

## 8. Integrations
Each integration has: on/off, keys (stored encrypted, shown masked), a "Test connection" button, and last error.
- Google Maps Platform key (server) and map tile key (client)
- WhatsApp Cloud API (phone number id, business account id, token, webhook verify token)
- Resend (API key, from address)
- Google Calendar (OAuth connect)
- Google Analytics 4 id, Google Tag Manager id, Meta Pixel id, TikTok Pixel id (loaded only after cookie consent)
- Portal connectors (see `13-integrations-and-jobs.md`)
- Meta / TikTok / Google lead form webhooks (shows the webhook URL and secret)
- AI provider key (or AI Gateway settings)

## 9. AI
- Assistant name and greeting for the website
- Tone: friendly / formal / short
- What the assistant must ask before booking (name, phone, email — which are required)
- Topics it must hand over to a human (price negotiation, legal questions, complaints) — editable list
- Show "Talk to a human" button: always / after 3 messages
- Working hours message (what to say outside office hours)
- Admin assistant: on/off; which actions it may propose (checkbox per action)
- Monthly AI spend limit and alert

## 10. Notifications
- Which events send email / WhatsApp to admins and agent profiles (new lead, lead not answered, new viewing, viewing cancelled, new valuation request, listing request, daily summary)
- Daily summary time

## 11. Legal and privacy
- Privacy policy page, terms page, cookie policy page (pick from pages)
- Cookie banner text and categories (necessary, analytics, marketing)
- Data retention: delete guest chats older than X months, anonymise lost leads after X months

## 12. Admin users and security
- List of admins, invite, deactivate, reset 2FA
- Require 2FA for admins
- Session length
- Audit log viewer (filter by user, module, date)
