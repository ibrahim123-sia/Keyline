# 03 — Roles and Permissions

There are only three roles. Do not add more without asking.

| Role | Who | How they get in |
|---|---|---|
| **Admin** | Agency owner and office staff | Created by another admin (first admin created by the seed / setup command). No public signup |
| **Customer** | A visitor who made an account | Signs up on the site (email + password, or Google if enabled) |
| **Guest** | Anyone not signed in | No account |

## Agent profiles are not users

Agency agents are **profiles** that the admin creates: name, photo, title, phone, WhatsApp, email, languages, areas they cover, short bio, active flag.
- Listings have one assigned agent profile.
- Leads and viewings are assigned to agent profiles.
- Agent profiles show on the website (listing contact card, team page).
- Agents do not log in. Notifications for an agent profile (new lead, new viewing) go to that agent's email and WhatsApp number if set.

## Admin users

- All admins have full access to the admin portal.
- Admins can invite another admin by email, deactivate an admin, and reset 2FA. They cannot deactivate themselves if they are the last active admin.
- Admin accounts must use 2FA (TOTP) — required by default, can be relaxed in settings for the demo.
- Every admin action goes to the audit log.

## Permission table

| Action | Guest | Customer | Admin |
|---|---|---|---|
| Browse site, search, map, property and project pages | ✅ | ✅ | ✅ |
| Use tools (mortgage, ROI, compare, valuation request) | ✅ | ✅ | ✅ |
| Compare up to 4 homes | ✅ (kept in browser) | ✅ (saved to account) | ✅ |
| Chat with customer assistant | ✅ | ✅ (history saved to account) | ✅ |
| Send inquiry, book tour, request callback, download brochure | ✅ | ✅ (prefilled) | ✅ |
| List your property / valuation request | ✅ | ✅ | ✅ |
| Save homes, lists, saved searches, alerts | ❌ (asked to sign up) | ✅ | ✅ |
| See own tours, inquiries, chats | ❌ | ✅ | — |
| Edit own profile, notification settings, delete account, export own data | ❌ | ✅ | ✅ (own admin profile) |
| Access `/admin` | ❌ | ❌ | ✅ |
| Everything in the admin portal | ❌ | ❌ | ✅ |
| Use admin assistant and MCP tools | ❌ | ❌ | ✅ |

## Rules

1. Permission checks run on the server for every admin page, server action, route handler and AI tool. Hiding a button is not security.
2. A customer can only read and change their own records (saved homes, searches, tours, inquiries, chats). Every query filters by the signed-in user id.
3. Guests who start a save action are asked to sign in or sign up; after signup the action completes (the saved home is added).
4. When a guest who already chatted or inquired signs up with the same email or phone, link their past lead, chats and tours to the new account.
5. Rate limits apply to guests and customers on forms, chat and tools (`14-non-functional.md`).
6. Session length: customers 30 days (remember me), admins 12 hours, with re-login for sensitive admin actions (adding admins, changing integrations).
