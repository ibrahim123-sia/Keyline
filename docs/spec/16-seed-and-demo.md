# 16 — Seed Data and Demo

## 1. Main preset: Haven & Dune (fictional agency, Dubai-style data)

Run with `pnpm db:seed --preset=haven-dune`.

- **Settings:** AED base currency; switcher AED, USD, EUR, GBP with example rates (marked "example"); sq.ft; km; permit field on, label "Permit no."; rent per year; rent payment options 1, 2, 4, 6, 12 + monthly; freehold / leasehold; time zone Asia/Dubai
- **Branding:** Desert Modern defaults
- **Admins:** `admin@demo.keyline` (owner), `staff@demo.keyline` — passwords printed by the seed, 2FA off for demo only
- **Customers:** 3 demo customers with saved homes, saved searches and past tours
- **Agent profiles:** 5 fictional agents with photos as placeholders, languages and areas
- **Locations:** Dubai → Dubai Marina, Downtown Dubai, Business Bay, Palm Jumeirah, Jumeirah Village Circle, Dubai Hills Estate, Dubai Creek Harbour, Jumeirah Beach Residence (centers and rough boundaries)
- **POIs:** real public places with real coordinates (malls, metro stations, beaches, parks, airport, public hospitals, well-known schools). Store `google_place_id` only if fetched with a real key
- **Developers:** 3 fictional developers (e.g. Northline Developments, Calder Homes, Saffron Bay Properties)
- **Projects:** 4 off-plan projects (e.g. The Linden Residences — 60/40, Palmera Grove Villas — 70/30 post-handover) with unit types and payment plans
- **Properties:** about 40
  - 22 for sale (ready), 8 off-plan units, 10 for rent
  - Types: apartments, villas, townhouses, penthouses, 2 offices, 1 shop, 2 plots
  - Prices realistic for each area (sample, not market data), some "price reduced", some verified recently, some stale (to show "Needs verification")
  - Each with 6–12 placeholder photos (or licensed stock if available), a floor plan for most, facilities, POIs computed (or seeded distances if no API key)
- **Leads:** about 30 across every source and channel, with UTM data, at every stage, some won with deal values, some unanswered (to show the alert)
- **Viewings:** 12 (past and upcoming, in person and video)
- **Conversations:** 6 web chats and 4 WhatsApp threads with AI and human messages; 2 items in the approval queue
- **Content:** home page with all main sections, About, Contact, Sell with us, Off-plan guide, legal pages; 6 blog posts; 4 area guides; 12 FAQs; 6 testimonials; header and footer menus
- **Stats:** 12 months of `area_price_stats` (source `admin_entered`, note "Sample data for demo") and `daily_metrics` so reports have charts

## 2. Second preset: US-style agency (proves Keyline is not tied to one market)

Run with `pnpm db:seed --preset=us-demo`.
- Fictional agency "Maple & Main Realty"
- USD, sq.ft, miles, permit field off, rent per month, no cheque options
- Locations: one fictional-friendly US metro with 4 neighbourhoods (real city names allowed, fictional listings)
- 12 properties, 8 leads, home page and 2 posts
- Same code, only settings and data differ

Also add a **"Switch demo market"** admin action (demo builds only) that reseeds with the other preset.

## 3. Demo logins and reset
- Public demo: read-only admin account (`viewer@demo.keyline`) that can open every admin screen but whose writes are blocked with a friendly message — this account is a demo-only flag, not a new role
- Nightly cron in the demo environment resets the database to the seed

## 4. Demo video script (2–3 minutes, for Upwork and YouTube)
1. **Hook (10s):** "This is Keyline: the website, CRM and AI lead engine a real estate agency runs on."
2. **Visitor side (50s):** home → search Dubai Marina on the map → draw an area → open a property → payment plan, POI distances, mortgage estimate → ask the assistant "2 bed under 2.5M near a school" → it shows homes and books a video tour
3. **Lead lands (30s):** admin dashboard → the new lead with source (Google Ads campaign), AI summary and score → viewing already in the calendar
4. **Owner control (40s):** edit the home page with the page builder → add a menu item → create a listing, drop a pin, POIs appear with travel times → SEO panel with AI suggestions → publish
5. **Admin AI (20s):** "Which listings got no inquiries in 30 days? Drop the Marina one by 3%" → preview → confirm → done, logged
6. **Global (10s):** switch to the US preset: dollars, miles, new agency — same product
7. **Close (10s):** stack in one line (Next.js, Cloudflare, Postgres + PostGIS, AI with tools, MCP) and a call to action

## 5. Upwork portfolio copy (draft)
**Title:** Keyline — AI-Powered Website, CRM & Lead Engine for Real Estate Agencies
**Description:** A complete platform a real estate agency runs on. The owner manages the whole website, listings, SEO and leads from one admin portal. Visitors search on a map, see real travel times to schools and malls, payment plans and mortgage estimates, and talk to an AI assistant that only answers from the agency's own listings and books viewings. Every lead is tracked from its first click (UTM and ad click ids) to the closed deal. An admin AI assistant answers business questions and makes changes after the owner confirms. Built with Next.js on Cloudflare, Postgres with PostGIS and pgvector, and an MCP server.
