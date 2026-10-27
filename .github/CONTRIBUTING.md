# Contributing to Propel

Thanks for working on Propel. This guide covers how changes are made, checked and merged.
For local setup, see the [README](../README.md#getting-started).

## Ground rules

The product specification (kept by the maintainers outside the repository) is the source of
truth; ask for it before a larger change. In short:

- TypeScript in strict mode; no `any` without a written reason.
- Validate every input on the server with Zod, and check permissions on every admin page,
  action and route handler.
- Write an audit log entry for every admin change.
- No hard-coded content, currency, units or market: copy lives in `src/lib/i18n`, the rest
  comes from Settings.
- Keep public pages fast: server components by default, client code loaded lazily, no heavy new
  dependencies without agreement.
- Explain decisions you make yourself in the pull request, and note notable changes in
  [`CHANGELOG.md`](../CHANGELOG.md).

## Workflow

1. Branch from `main`: `feat/<topic>`, `fix/<topic>`, `docs/<topic>` or `chore/<topic>`.
2. Keep each commit to one feature or fix, with its tests.
3. Write commit messages in the [Conventional Commits](https://www.conventionalcommits.org/)
   style, e.g. `feat(viewings): reminders the day before`, `fix(seo): …`, `test(leads): …`.
4. Open a pull request and fill in the template. CI must pass before merging.

## Database changes

Change the Drizzle schema in `src/db/schema/`, then run `pnpm db:generate` and commit the generated
migration with it. CI fails when the schema and the migrations disagree. Add a column when a
feature needs it and give the reason in the pull request. Removing or renaming anything in
the data model needs agreement first.

## Checks to run before pushing

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test            # unit and integration
pnpm test:e2e        # end to end, for user-facing changes
```

Add or update tests with every change: unit tests for pure logic, integration tests for server
code that touches the database, and a Playwright spec for user journeys.

## Secrets

Never commit secrets. `.env.local` and `.dev.vars` are ignored by git; integration keys belong in
Settings → Integrations, where they are stored encrypted. Report security issues privately as
described in [`SECURITY.md`](SECURITY.md).
