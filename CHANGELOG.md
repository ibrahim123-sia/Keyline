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
