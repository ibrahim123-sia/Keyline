# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Report them privately through
GitHub's [private vulnerability reporting](https://github.com/ibrahim123-sia/Keyline/security/advisories/new)
for this repository.

Include what you found, the steps to reproduce it and the impact you expect. We will confirm
receipt, keep you informed while we work on it, and credit you once it is fixed if you wish.

## Supported versions

Keyline is deployed continuously from `main`; fixes go to the latest version only.

## How Keyline protects data

- Every admin page, server action and route handler checks permissions on the server.
- All input is validated on the server; public forms are rate-limited and protected against spam.
- Admins sign in with two-step verification; sessions expire and failed sign-ins lock accounts.
- Integration keys are encrypted at rest (AES-256-GCM); passwords are hashed.
- Admin changes are written to an append-only audit log.
- Customers can download their data and delete their account from the account area.
