# 12 — Customer Area (`/account`)

Simple, uses the public site theme. Left menu on desktop, tabs on phone.

## 1. Sign up and sign in
- Email + password (with strength check), email verification, forgot password
- Google sign-in (if enabled in settings)
- Sign-in modal can open from any save action and returns the visitor to the same place with the action completed
- On signup, link past activity by email/phone: lead, chats, tours, inquiries, compare set, and the visitor id

## 2. Pages
| Page | What it shows |
|---|---|
| **Overview** | Greeting, upcoming tours, new matches from saved searches, recently viewed |
| **Saved homes** | Lists (default "Saved" + custom lists like "Shortlist", "For my parents"); move between lists; personal note per home; status change shown ("Price dropped by AED 50,000", "Now reserved"); share a list by link |
| **Saved searches** | Name, filters summary, map thumbnail if polygon, alert frequency (instant / daily / weekly / off), new matches count, edit, delete |
| **Tours** | Upcoming and past viewings; reschedule, cancel, add to calendar; feedback form after a tour |
| **Inquiries** | Messages sent about homes and their status |
| **Chats** | Past assistant conversations; continue a chat |
| **Compare** | Saved compare set |
| **Profile** | Name, phone, email, preferred contact method, password, connected Google account |
| **Notifications** | Email and WhatsApp choices per alert type, newsletter, marketing consent |
| **Privacy** | Download my data (JSON + PDF), delete my account (confirmation, then anonymise linked leads) |

## 3. Alerts (jobs in `13-integrations-and-jobs.md`)
- **New match:** a newly published listing matches a saved search → instant (within 10 min), daily digest or weekly digest
- **Price drop:** a saved home or a match drops in price → instant email
- **Status change:** saved home becomes reserved, sold or rented → email
- Every email has: up to 6 listing cards, "View all matches", manage alerts link, one-click unsubscribe per search
- Never send the same listing twice for the same search (`alerts_sent`)
- WhatsApp alerts only if the customer opted in and only through approved templates

## 4. Rules
- Customers only ever see their own data
- Max 20 saved searches and 500 saved homes per customer
- Deleting a saved search stops its alerts immediately
