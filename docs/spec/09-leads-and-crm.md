# 09 — Leads, Attribution and CRM

Goal: no lead is lost, every lead has a known source, and the admin always knows who to talk to next.

## 1. Lead sources (every one creates or updates a lead)

| # | Source | `source` value | Captured data | Extra behaviour |
|---|---|---|---|---|
| 1 | Property inquiry form | `form` | name, email, phone, message, property | Auto-reply email/WhatsApp; AI first reply if enabled |
| 2 | Contact form | `form` (detail: contact) | name, email, phone, message, topic | |
| 3 | Website AI chat | `chat` | whatever the assistant collected + full chat | Summary and score at chat end |
| 4 | WhatsApp click (button on site) | `whatsapp` (detail: click) | visitor id, property ref | Logged as event; lead created when the first WhatsApp message arrives and is matched to the click by ref code in the pre-filled text |
| 5 | WhatsApp inbound (AI agent) | `whatsapp` | phone, name from profile, chat | AI agent handles; human takeover any time |
| 6 | Book a tour | `tour` | name, phone, email, property, date/time, type | Creates viewing; calendar invite |
| 7 | Request callback | `callback` | name, phone, best time | Task "Call back" at chosen time |
| 8 | Call button click | `call_click` | visitor id, property | Event only; creates a "possible call" note if visitor is already a lead |
| 9 | Mortgage pre-approval | `mortgage` | name, phone, email, income band, down payment, property | |
| 10 | ROI report "email me" | `roi` | email, inputs | Sends PDF report |
| 11 | Brochure download | `brochure` | email (if gate on) | Sends PDF link |
| 12 | Valuation request | `valuation` | owner details, property details, photos | AI range, task for agent |
| 13 | List your property | `listing_request` | owner details, property details, asking price | Task for agent |
| 14 | Account signup | `signup` | name, email | Only becomes a lead after an action that shows intent (save search, inquiry) — setting |
| 15 | Saved search / price alert | `saved_search` | filters | Requirements filled from filters |
| 16 | Newsletter | `newsletter` | email | Subscriber, not a lead unless setting says so |
| 17 | Property portals | `portal` (detail: portal name) | name, phone, email, listing ref, message | Via connector (API when credentials exist; email parsing or CSV in demo) |
| 18 | Social lead forms (Meta, TikTok, Google) | `social_form` | form fields + campaign/ad ids | Webhook with secret check |
| 19 | Manual entry | `manual` | any | Admin form, "walk-in", "phone call", "referral" sub-types |
| 20 | CSV import | `import` | mapped columns | Validation preview |
| 21 | Offline QR code | `qr` | via UTM link | Visitor arrives with `utm_medium=qr` |

## 2. Attribution (UTM and click ids)

### Capture
- On the first request, middleware sets a first-party `vid` cookie (random id, 1 year). If the visitor rejects analytics cookies, keep only a session id and still record the landing source for that session.
- On every landing with campaign data, read: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`, plus `document.referrer` and landing path.
- Compute `channel`:
  - click id or `utm_medium` in (cpc, ppc, paid, paid_social) → paid_search / paid_social
  - referrer is a search engine, no utm → organic_search
  - referrer is a social site, no utm → organic_social
  - `utm_medium=email` → email
  - `utm_medium=qr` → offline_qr
  - `utm_source` is a portal name → portal
  - other referrer → referral
  - none → direct
- **First touch:** written once, never overwritten.
- **Last touch:** updated on every visit that has campaign data or a new external referrer (direct visits do not overwrite last touch).
- **Journey:** page views, listing views, searches, tool uses, chat starts stored in `visitor_events`.

### At lead creation
- Copy `first_touch` and `last_touch` onto the lead (frozen copy).
- Link the visitor to the lead; later events keep attaching to the same lead.
- Show on the lead: "First came from Google Ads (campaign marina-2bed) 12 days ago; converted after Instagram ad (offplan-oct) on a property page."

### Admin tools
- **UTM link builder:** base URL (any page or listing), source, medium, campaign, term, content → full URL + short link (`/go/abc12`) + downloadable **QR code** (SVG/PNG). Saved in `utm_links` with click counts.
- **Campaign report:** leads, viewings, won deals and deal value by source / medium / campaign / channel, first touch vs last touch toggle, date range.
- Later (leave the interface): send offline conversions back to Google Ads and Meta with the stored click ids.

## 3. Lead processing pipeline (on every new lead)
1. **Normalise** phone to E.164, lowercase email.
2. **Find duplicate:** match contact by email or phone (setting). If found, add to the existing open lead (new `lead_event`) instead of a new lead — unless the type differs (a buyer who also sells → second lead linked to the same contact).
3. **Enrich requirements** from the property of interest (purpose, area, type, price band) and the form/chat.
4. **Assign** an agent profile using the rule in settings (listing's agent → area match → round robin).
5. **AI score and summary** (`10-ai.md`), queued.
6. **Notify** the agent profile and admins (email / WhatsApp) using templates.
7. **Auto first reply** (if enabled): instant email + WhatsApp template ("Thanks, [name]. [Agent] will reach out shortly. Want to book a viewing?") — counts as first response only if it is a real conversation reply, not a template (setting).
8. **Start response timer:** if no human or AI conversational reply within X minutes, alert admins and mark the lead red in the list.
9. **Create task** if needed (callback, valuation visit).

## 4. Lead management screens

### Leads list (Admin → Leads)
Table + Kanban toggle.
- Columns: name, type, source + channel, interest (property / requirement summary), AI score, stage, agent, last activity, next task, response time
- Filters: stage, source, channel, campaign, type, agent, score range, date, unanswered, has viewing, budget range, area
- Saved views: "Unanswered", "Hot (score 70+)", "Viewings this week", "Sellers and landlords"
- Bulk: assign, change stage, add tag, export, merge
- Kanban: columns are stages, drag to move (asks for lost reason when moved to Lost, deal value when moved to Won)

### Lead page
- Header: name, type, stage selector, score badge, agent, quick actions (WhatsApp, call, email, book viewing, add task, mark won/lost)
- Left: contact details, requirements (editable), properties of interest (cards), attribution box (first touch, last touch, channel), consent status
- Center: **timeline** (all events, messages, viewings, notes, AI summaries), composer to add a note / log a call / send email / send WhatsApp (template outside the 24h window)
- Right: AI panel: summary, why this score, suggested next step, **matching listings** (from requirements, with "Send to lead" that creates a share message), tasks, viewings, journey (pages and listings viewed)
- **Send properties:** pick listings → creates a personal shortlist link for the lead (tracks opens and which homes they view)

### Contacts
List of people (one contact can have several leads). Merge duplicates with a field-by-field picker.

## 5. Viewings (tours)

### Booking on the site
- From property/project page: choose **In person** or **Video tour**
- Calendar shows free slots for the listing's agent profile (from working hours, existing viewings, Google Calendar busy times, buffer and notice settings)
- Visitor's own time zone shown with the agency time zone in brackets
- Fields: name, phone, email, notes; returning customers prefilled
- Confirmation screen + email + WhatsApp, `.ics` invite, video link created for video tours (Meet/Zoom or WhatsApp video note)
- Reminders 24h and 2h before (settings)
- Reschedule / cancel link in the messages (token-based, no login needed)

### Admin
- **Calendar** (day/week/agent views), drag to reschedule, colour by status
- Viewing panel: lead, property, agent, type, status buttons (confirm, done, no-show, cancel), notes
- After "done": ask for feedback (rating + text) from the customer by email/WhatsApp; agent notes; suggested next step (send similar homes, offer)
- Google Calendar two-way sync per agent profile

## 6. Inbox (Admin → Inbox)
- All conversations from web chat, WhatsApp and email in one list: status (AI handling / needs human / human / closed), channel icon, last message, unread
- Conversation view: messages with sender labels (customer, AI, admin), AI tool calls shown in small grey lines (e.g. "Searched listings: 3 results", "Booked viewing")
- **Take over** button: AI stops replying in that conversation until "Hand back to AI"
- **Approval queue:** replies the AI was not allowed to send (topics in the human-only list) appear as drafts; admin approves, edits or rejects
- Quick replies (saved snippets), send listing card, send brochure
- WhatsApp 24-hour rule: outside the window only approved templates can be sent; the composer switches to template mode automatically

## 7. Reports (Admin → Reports)
- **Overview:** leads, viewings, won, deal value, avg first response, conversion rate, by period with comparison
- **Sources and campaigns:** table + chart by source / channel / campaign (first vs last touch)
- **Funnel:** lead → contacted → viewing → offer → won, by source
- **Response time:** average and distribution, unanswered count, by agent profile and hour of day
- **Listings:** views, saves, inquiries, inquiry rate, days on market, price reductions, stale listings (not verified in X days, no inquiries in X days)
- **Agents:** leads, viewings, won, deal value, response time per agent profile
- **AI:** conversations handled, handed over, viewings booked by AI, AI cost
- Export any report to CSV and PDF; schedule a weekly email report
