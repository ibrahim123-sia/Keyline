# Propel — Project Spec (start here)

**Propel** is an AI-powered website, CRM and lead engine for real estate agencies.
One agency installs it and runs its whole business from it.

This folder is the single source of truth for the project. Read every file before writing code.
If two files disagree, or something is unclear, stop and ask. Do not guess on big decisions.

## Files, in reading order

| File | What it covers |
|---|---|
| [`01-rules-and-stack.md`](01-rules-and-stack.md) | Hard rules, locked tech stack, how to work with me |
| [`02-design-system.md`](02-design-system.md) | Desert Modern theme, tokens, components, layout rules, every page layout |
| [`03-roles-and-permissions.md`](03-roles-and-permissions.md) | Admin, Customer, Guest, agent profiles, full permission table |
| [`04-settings.md`](04-settings.md) | Every setting the admin controls: branding, market, contact, integrations, AI |
| [`05-data-model.md`](05-data-model.md) | Every table and field |
| [`06-public-website.md`](06-public-website.md) | Every public page, section by section, search and map |
| [`07-properties-and-projects.md`](07-properties-and-projects.md) | Listing editor, media, POI distances, payment plans, projects, developers |
| [`08-cms-and-seo.md`](08-cms-and-seo.md) | Page builder, all section types, blog, area guides, menus, footer, SEO |
| [`09-leads-and-crm.md`](09-leads-and-crm.md) | Every lead source, attribution (UTM), lead record, pipeline, viewings, inbox, reports |
| [`10-ai.md`](10-ai.md) | Customer assistant, admin assistant, tools, confirm flow, MCP, AI helpers |
| [`11-tools.md`](11-tools.md) | Mortgage, ROI, compare, brochure PDF, valuation, price trends, map draw, commute, share cards |
| [`12-customer-area.md`](12-customer-area.md) | Accounts, saved homes, saved searches, alerts, tours, inquiries |
| [`13-integrations-and-jobs.md`](13-integrations-and-jobs.md) | WhatsApp, email, Google, portals, webhooks, background jobs, notifications |
| [`14-non-functional.md`](14-non-functional.md) | Performance, security, privacy, accessibility, logging, testing |
| [`15-build-phases.md`](15-build-phases.md) | 10 phases, tasks and "done" checklist per phase |
| [`16-seed-and-demo.md`](16-seed-and-demo.md) | Demo data, second market preset, demo script for the video |

## The product in one paragraph

A visitor lands on the agency's website, searches homes on a list and a map, opens a property and sees photos, floor plans, the payment plan, real distances to nearby schools and malls, and a monthly payment estimate. They chat with an AI assistant that only answers from the agency's own data, and it books a viewing. That visitor becomes a lead with full source tracking (UTM, ad click ids, pages viewed). The admin sees the lead in a pipeline with an AI summary and score, and runs the whole agency from one portal: listings, website pages, blog, SEO, leads, viewings and reports. An admin AI assistant answers questions about the business, suggests next steps, and does tasks after the admin confirms.

## Positioning

- Propel is for real estate agencies anywhere. Never write a city or country in Propel's own branding.
- The demo agency is **Haven & Dune**, fictional, with Dubai-style data (off-plan, payment plans, AED). All market details come from settings.
- Single-tenant: one agency per install. Not a SaaS. But every main table has `agency_id` so multi-tenant stays possible later.

## Out of scope (do not build)

- Multi-agency SaaS: agency signup, billing, super admin
- Short-term / holiday rental bookings (nightly calendar, payments). The ROI simulator may still estimate short-term income
- Tracking real instalment payments from buyers (payment plans are shown, not collected)
- Accounting, invoices, commission payroll, contracts and e-signature
- Agent logins (agents are profiles only)
- Arabic or other languages (code is i18n-ready only)
- Native mobile apps

## First instruction to the agent

Read this README and every file in `docs/`. Then write a short plan for Phase 1 (`docs/15-build-phases.md`) and wait for my approval before writing code. Keep `PROGRESS.md` updated after every step.
