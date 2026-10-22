# Changelog

All notable changes to Lintel. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Project scaffold: Next.js 16 (App Router, Cache Components), TypeScript strict, Tailwind CSS v4, ESLint + Prettier.
- Database: Drizzle schema and migrations; local PostgreSQL 18 (PGlite) with PostGIS, pgvector, pg_trgm, unaccent.
- Settings for all 12 groups with a cached loader; encrypted integration secrets; append-only audit log.
- Design tokens from Branding settings, shadcn/ui, i18n dictionaries, site/account/admin shells.
- Authentication: customer sign-up with email verification, password reset, admin 2FA, login lockout, setup command.
- Background jobs with retries and dead-lettering; rate limits; health check.
- Admin UI kit (fields, side panels, confirm dialogs, sortable lists, URL-driven data table).
- Setup: locations tree with map pin and boundary drawing, property types, facilities, badges, POI types, places (with Google import), developers (merge), agent profiles; slug changes create 301 redirects.
- Media library on R2 (local disk in development): signed uploads, processing job (lossless metadata strip, HEIC conversion in the browser, dimensions, placeholder colour), folders, alt text, crops, usage, replace, safe delete, resized variants; media picker.
- Settings screens for all 12 groups, including the branding editor with live preview and contrast check, pipeline stages, and integrations with encrypted keys and connection tests.
- Admin users (invite, deactivate, reset two-step verification, API tokens), audit log viewer, System page (jobs, scheduled tasks, integration status, retry).
- Listings: property list (filters, saved views, bulk actions, quick actions), property editor (all sections, autosave, publish rules, completeness score), payment plan builder and templates, rich text descriptions, price history and automatic badges, nearby places with travel times (Google Routes or straight-line), CSV import (mapping, validation preview, photo downloads) and export.
- Projects: list, editor with unit types and payment plan, nearby places, and draft listings from unit types.
- Public site: search pages (/buy, /rent, /off-plan and area landings) with filters in the URL, list and map (price pins, clusters, draw an area), autocomplete and phone layouts; property pages with gallery, payment plan, nearby places, mortgage estimate, similar homes and forms; project, developer and agent pages; currency switcher, cookie banner, helpful 404; home page from sections; Haven & Dune demo seed.
- CRM core: visitor attribution (first and last touch, journey with consent), lead pipeline for every source (dedupe, assignment, timeline, notifications, auto-reply, score with reasons, response timer), editable message templates; listing forms create leads.
- Website: page builder with every section type, templates, revisions, scheduling and preview links; blog, area guides, testimonials and FAQs; menus, footer and announcement bar; sitemap, robots, structured data, title patterns, redirects manager, 404 monitor and SEO report.
- CRM: leads list and board, lead page, shortlists, contacts and merges, manual entry and CSV import; inbox with WhatsApp, email, portals, social lead forms and website chat; campaign links with QR codes; viewings booked online with reminders, invites and a private link to move or cancel.
- Viewings admin calendar with Google Calendar sync, days off, and tours on project pages; message templates editor; page forms as leads; newsletter with double opt-in; campaign report.
- Saved-search and saved-home alerts: instant, daily and weekly, price drops and status changes, with one-click unsubscribe.
- Redirects now answer with a real 301 from the middleware, and unknown addresses with a real 404.
- Customer area: save and compare homes, save searches, a sign-in prompt that finishes a guest's save, and `/account` (saved homes and shareable lists, searches, tours, inquiries, chats, compare, profile, notifications, data download and account deletion); 3 demo customers.

### Fixed

- Blog and page rich text saved from the editor no longer fails validation ("Invalid input").
- The 404 monitor counts visits at request time instead of breaking prerendering.
- Website chat and the admin inbox no longer crash in browsers where scrolling returns a promise.
- Tour booking fits its dialog when there are many days to choose from.
- A shortlist's opens are counted once per visit in a browser (not twice, and not by link previews).

### Changed

- Documentation moved to `docs/` (specification in `docs/spec/`, build progress in `docs/PROGRESS.md`); new README, contributing guide, security policy, pull request template and licence.
