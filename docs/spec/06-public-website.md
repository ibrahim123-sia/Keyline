# 06 — Public Website

All public pages are server-rendered, fast and SEO-ready. All copy comes from the CMS (`08-cms-and-seo.md`) or from listing data.

## 1. Route map

| Route | Page |
|---|---|
| `/` | Home (page builder page marked `is_home`) |
| `/buy`, `/rent`, `/off-plan` | Search results, preset purpose |
| `/buy/[location-slug]`, `/rent/[location-slug]` | Search results for an area (SEO landing) |
| `/buy/[location-slug]/[type-slug]` | e.g. `/buy/dubai-marina/apartments` (SEO landing) |
| `/property/[slug]` | Property page |
| `/projects`, `/projects/[slug]` | Off-plan projects list and project page |
| `/developers`, `/developers/[slug]` | Developers list and page |
| `/areas`, `/areas/[slug]` | Area guides |
| `/insights`, `/insights/[slug]`, `/insights/category/[slug]` | Blog |
| `/agents`, `/agents/[slug]` | Team and agent profile with their listings |
| `/tools/mortgage`, `/tools/rental-returns`, `/tools/compare`, `/valuation`, `/list-your-property` | Tools (`11-tools.md`) |
| `/contact`, `/about`, any `/[slug]` | Pages from the page builder |
| `/account/...` | Customer area (`12-customer-area.md`) |
| `/sitemap.xml`, `/robots.txt`, `/og/...` | SEO and share images |

All list routes accept filter query params (see 4.2). Unknown slugs return a helpful 404 with a search box and popular areas.

## 2. Global parts

**Header:** logo, header menu (from Menus), currency switcher, "Sign in" or account menu (avatar → Saved, Searches, Tours, Profile, Sign out), primary button "List your property" (text and link editable).
**Footer:** from settings and footer menus. Licence number, legal links, social icons, newsletter signup (optional), "Powered by Lintel".
**Chat widget:** bottom-right launcher on every page (can be hidden per page). Opens the customer assistant (`10-ai.md`). Knows the page context (which property or area the visitor is on).
**Cookie banner:** first visit. Categories: necessary (always), analytics, marketing. Choices saved and changeable from footer link.
**Currency switcher:** changes display currency site-wide (cookie). Prices show "≈" when converted, with tooltip "Approximate. Listed price is AED 2,450,000."

## 3. Home page
Built from sections (`08-cms-and-seo.md`). Default seed layout:
1. **Hero with search:** eyebrow, headline, subline, search card (tabs Buy / Rent / Off-plan; Location autocomplete; Type; Budget; Beds on wider screens; Search button), hero image with a floating "Verified in person" card
2. **Promise strip:** 3 short points
3. **Featured homes:** admin picks or "latest featured", 3–6 cards, "View all"
4. **Off-plan projects:** dark band, 2–4 project cards (plan label, handover, starting price, unit types)
5. **Area guides:** 4 area cards
6. **AI assistant teaser:** text + quick-prompt chips + a mini chat preview; clicking a chip opens the chat with that prompt
7. **Tools:** mortgage, rental returns, compare, valuation
8. **Insights:** latest 3 posts
9. **Testimonials** (optional)
10. **Seller CTA:** "Selling or renting out?" → valuation and list-your-property
11. Footer

## 4. Search results

### 4.1 Layout
- Desktop: filter bar on top; results list left; sticky map right. Map can be hidden ("List only").
- Phone: results list; floating "Map" button switches to full-screen map with a bottom card for the selected pin; "Filters" button opens a full-screen filter sheet with a sticky "Show N homes" button.
- Header shows: H1 (generated, e.g. "Apartments for sale in Dubai Marina"), results count, sort.
- Each SEO landing route also shows an intro paragraph (from the area guide or a short admin text) and FAQs at the bottom.

### 4.2 Filters (all in the URL so links can be shared and saved)
| Filter | Param | Notes |
|---|---|---|
| Purpose | `purpose` | sale / rent |
| Completion | `completion` | ready / off_plan / any |
| Location | `loc` (multi) | from autocomplete: city, area, community, building, project |
| Drawn area | `poly` | encoded polygon from draw tool |
| Property type | `type` (multi) | from master data |
| Price | `min`, `max` | in base currency; slider shows visitor currency |
| Beds | `beds` | studio, 1, 2, 3, 4, 5+ (multi) |
| Baths | `baths` | 1+, 2+, 3+, 4+ |
| Size | `smin`, `smax` | in settings unit |
| Furnishing | `furn` | |
| Facilities | `fac` (multi) | |
| Badges | `badge` | e.g. verified only, price reduced |
| Handover by | `handover` | off-plan only, year/quarter |
| Payment plan | `plan` | has plan / post-handover plan |
| Rent payments | `cheques` | number of payments accepted |
| Keyword | `q` | full-text |
| Reference | `ref` | jump straight to a listing |
| Commute | `commute` | place id + max minutes + mode (see `11-tools.md`) |
| Agent | `agent` | |
| Sort | `sort` | newest (default), price asc, price desc, size, price per area, recently reduced |
| Page | `page` | 20 per page |

"Clear all", active filter chips with ×, and "Save search" (customers; guests are asked to sign up).

### 4.3 Autocomplete
- Starts at the 2nd character, debounced 150ms.
- Searches locations, buildings, projects, developers, and listing references.
- Typo-tolerant using `pg_trgm` similarity + `unaccent` (e.g. "marena" → "Dubai Marina").
- Groups results by kind with icons; keyboard navigation (up/down/enter/esc); recent searches when empty.
- Response under 150ms target (cache common prefixes).

### 4.4 Result cards
Photo (swipeable mini-gallery on hover/phone), badges, save heart, price (or "Price on request"), "per year" for rent, title, location, beds / baths / size, verified line ("Verified 3 days ago"), one nearby POI hint (closest school or metro), "Handover Q3 2027" for off-plan. Clicking a card opens the property page. Hovering a card highlights its map pin and the other way round.

### 4.5 Map
- Price pills as pins; selected pin dark; clusters when zoomed out (count bubble).
- "Search as I move the map" toggle (off by default).
- "Draw your area" tool: draw a polygon, results update, "Clear drawing".
- "Commute time" button opens the commute filter.
- Listings with `map_pin_exact = false` show an approximate circle, not an exact pin.

### 4.6 No results
Message, suggestions: remove the strictest filter (show which), nearby areas with counts, "Save this search and get alerts".

## 5. Property page
Order of blocks:
1. Breadcrumb (Home / Buy / Area / Community)
2. Badges, title, address line (never the unit number), actions: Save, Share, Compare, Print / Brochure
3. **Gallery:** 1 large + 4 small; "All photos · Floor plan · Video · 360" button opens a full-screen lightbox with tabs (Photos, Floor plans, Video, 360 tour)
4. **Facts bar:** price, beds, baths, size, furnishing, ownership (or for rent: yearly rent, payments accepted)
5. **About this home:** description, highlights list, "Read more"
6. **Details table:** type, reference, completion, year built, floor, view, parking, service charges, permit number, last verified
7. **Facilities** grid with icons
8. **Payment plan** (if off-plan or plan attached): step cards with %, stage and timing; a timeline bar; "Download payment schedule" (PDF)
9. **Rent payments** (rentals): table of options (e.g. 1 payment AED 120,000 / 4 payments AED 30,500 each) if the admin entered them
10. **Location and nearby:** map with pin (or circle), then POI list grouped by type: name, type, distance, drive or walk time. Filter chips: Schools, Health, Shopping, Transport, Leisure
11. **Monthly payment** mini calculator (sale) or "Rent vs buy" hint (rent)
12. **Investment snapshot** (if expected rent or yield set): gross yield, estimated net yield, "Open ROI simulator"
13. **Price history** (if any changes): small chart and list
14. **Project block** (if linked): project name, developer, progress, "See all units in this project"
15. **Similar homes:** same purpose, area, ±20% price, ±1 bed
16. **Recently viewed**

**Sticky contact card (desktop) / bottom bar (phone):**
- Price, price per area
- Agent profile: photo, name, languages, "usually replies in a minute"
- **Book a tour** (primary) → tour booking modal (`09-leads-and-crm.md` §5)
- **WhatsApp** → opens WhatsApp with a pre-filled message including the reference and page URL, and logs a `whatsapp_click` event
- **Call** → reveals the number and logs `call_click`
- **Request callback** (small link) → short form
- **Download brochure** → PDF (`11-tools.md`), optional email gate set in settings
- Inquiry form: name, email, phone, message (pre-filled "I'm interested in HD-2041"), "Send me similar homes" checkbox, consent checkbox
- Trust box: "Verified by our team on [date]", permit number, reference

**Status handling:** reserved/under offer shows a banner but keeps the page; sold/rented shows "This home is no longer available" with similar homes, page stays live (good for SEO) but is excluded from search and sitemap after 90 days (admin can change).

## 6. Project page
Hero, key facts (developer, location, handover, starting price, payment plan label, status, progress %), description, highlights, **unit types table** (type, beds, size range, price from, floor plan, "Enquire"), available listings in this project, payment plan block, amenities, location + POIs, gallery, master plan, brochure download, developer card, contact card, similar projects.

## 7. Area guide page
Hero, intro, lifestyle highlights, map with POIs by type, stats (admin-entered with source note, plus live counts from listings), **price trends** chart (`11-tools.md`), homes for sale and rent in this area (tabs), projects in this area, FAQs, related posts.

## 8. Agent pages
Team grid; agent page with photo, languages, areas, bio, contact buttons, their active listings.

## 9. Blog (Insights)
List with category tabs and search; post page with cover, title, author, date, reading time, body, related listings block (from `related_property_ids`), related posts, share buttons, newsletter signup.

## 10. Forms (all)
- Fields validated on client and server; friendly error messages
- Honeypot field + rate limit + Cloudflare Turnstile on public forms
- Hidden attribution: every form submit attaches the visitor id; the server joins first/last touch
- Success state says what happens next ("We'll reply within a minute on WhatsApp")
- Every submit creates or updates a lead (`09-leads-and-crm.md`)
