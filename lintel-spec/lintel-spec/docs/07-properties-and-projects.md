# 07 — Properties, Projects and Master Data (Admin)

## 1. Master data screens
Each master data type has its own admin page (Admin → Setup): list with search, drag to reorder, create/edit in a side panel, usage count ("used by 23 listings"), and safe delete (blocked if in use; offer "merge into…").

| Screen | Fields | Notes |
|---|---|---|
| **Locations** | parent, level, name, slug, center point (map), optional boundary polygon (draw on map), description, featured, SEO | Tree view (country → city → area → community → building). Moving a node keeps children |
| **Property types** | name, category, icon, hidden fields | Land hides beds/baths; commercial hides beds |
| **Facilities** | name, icon (icon picker), group | |
| **Badges** | name, colors (with contrast check), icon, auto rule, auto days | Preview chip shown live |
| **POI types** | name, icon, search radius, travel mode, show on property | |
| **POIs** | type, name, address, map point, Google place id, website, active | "Import from Google": search nearby places by type around a location and add them in bulk |
| **Developers** | name, logo, description, website, year, SEO | Page on site |
| **Agents** | see `03-roles-and-permissions.md` | Connect Google Calendar per agent |

## 2. Property list (Admin → Properties)
- Data table: cover thumb, reference, title, purpose, status pill, price, area, beds, agent, verified (with days since), views (30d), inquiries (30d), updated
- Filters: purpose, status, completion, type, area, agent, verified older than X days, has no photos, missing SEO, featured
- Saved views (e.g. "Needs verification", "Drafts", "Off-plan")
- Bulk actions: change status, assign agent, add/remove badge, feature/unfeature, mark verified, export CSV, archive
- Quick actions per row: open, duplicate, view on site, copy link, generate brochure

## 3. Property editor
One page with a left section nav and a sticky right panel (status, publish, preview, completeness score). Autosave drafts every 10 seconds. Unsaved-changes warning.

### Sections
1. **Basics:** purpose, completion, type, title (AI suggest), reference (auto), status, agent, featured toggle
2. **Location:** location picker (tree autocomplete), building name, address line, unit number (private), floor, **map pin** (drag pin; search address to drop; or paste coordinates), "exact pin public" toggle
3. **Price:** price, currency (base by default), price on request (shows warning: "72% of buyers skip listings without a price" — keep text short), rent period, rent payment options and amounts, monthly available, deposit, service charge, agency fee text
4. **Specs:** beds (studio = 0), baths, size, plot size, year built, floor count, parking, furnishing, ownership, view (multi), maid room, study
5. **Off-plan** (if completion = off-plan): project link (optional, autofills developer, handover, progress), handover date or quarter, payment plan (pick existing or build new)
6. **Investment:** expected yearly rent, tenanted, tenancy end. Yield computed and shown
7. **Description:** rich text (Tiptap: headings, bold, lists, links), highlights (list), **AI: write / improve / shorten** (preview before insert)
8. **Media:** drag-and-drop upload (multi), reorder, set cover, alt text (AI suggest), captions; floor plans; video URL; 360 tour URL; brochure upload (or auto-generated)
9. **Facilities:** checkbox grid grouped by facility group
10. **Badges:** manual badges; auto badges shown as read-only with reason
11. **Nearby (POIs):** see §4
12. **Trust:** permit number, verified toggle, last verified date, "Mark verified today" button
13. **SEO:** slug, SEO title, description (AI suggest), OG image, canonical, noindex, Google preview + WhatsApp share preview
14. **Activity:** price history, views, inquiries, leads linked, audit trail

### Completeness score (right panel)
Points for: 8+ photos, floor plan, description 120+ words, 5+ facilities, POIs computed, SEO title and description, permit number, verified in last 30 days. Shows what's missing with links. Publishing is allowed below 100%, but required fields block publishing.

### Publish rules (block publish if missing)
Title, purpose, type, location, map pin, price (or price on request), beds/baths/size (unless the type hides them), at least 1 photo with alt text, permit number if settings require it, payment plan = 100% if a plan is attached.

### On save events
- Price changed → write `price_history`; if lower than `original_price`, auto badge "Price reduced" for N days; queue price-drop alerts
- Status → sold/rented → stop alerts, remove from search, keep page live
- Pin moved → queue POI distance job
- Content changed → queue embedding refresh
- Published first time → set `published_at`, auto badge "New" for N days, queue new-listing alerts, revalidate search caches and sitemap

## 4. POI distances (real location, measured)
1. Admin drops the pin. The system queues a **POI job**.
2. Job finds candidate POIs:
   - From the agency's own `pois` table within each POI type's search radius (PostGIS `ST_DWithin`)
   - Optionally from Google Places nearby search for missing types; new places are added to `pois` (admin can disable this)
3. For the closest N per type (default 3), call Google **Routes** for drive (and walk, if the type's mode is walk or straight distance < 1.5 km) distance and time. Batch calls; respect quotas.
4. Save results in `property_pois` with `computed_at`.
5. Admin sees a table: POI, type, straight distance, drive time, walk time, "Show on site" toggle, manual override text, drag to order. "Recalculate" button.
6. Public page shows the shown POIs grouped by type with distance in the settings unit and the time.
7. Never call Google on a page view. Recompute only when the pin moves, the admin clicks recalculate, or monthly via cron for listings older than 90 days.
8. If the API key is missing or fails, show straight-line distances only and a clear note in the admin.

## 5. Payment plan builder
- Add steps: stage (booking / construction / handover / post-handover), label, percent, timing text, optional due date, optional number of instalments
- Running total with a bar; must reach exactly 100%
- Templates: "10/50/20/20", "60/40", "70/30 post-handover", "1% monthly" — admin can save their own
- Preview as the public site shows it
- Reusable: one plan can be attached to a project and inherited by its units, or overridden per listing
- Export payment schedule as PDF for a given price (amount per step computed)

## 6. Projects (Admin → Projects)
- List: name, developer, area, status, handover, progress, units available, published
- Editor sections: basics (name, developer, location, pin, status), dates (launch, handover), progress (with "updated on"), pricing (starting price), description, highlights, media (gallery, master plan, video, tour, brochure), facilities, unit types table (inline editable rows), payment plan, nearby POIs (same job as properties), SEO
- "Create listings from unit types" helper: makes draft listings for selected unit types with project data prefilled

## 7. Import and export
- **CSV import** for properties: download template; upload; column mapping screen; validation preview (errors per row); import as drafts; photos from URLs fetched by a background job
- **CSV export** of any filtered list
- **XML feed** (later, optional): property feed endpoint for portals, behind a token. Leave the interface ready.

## 8. Media library (Admin → Media)
Grid and list views, folders, search by name/alt, filter by type, used-in list, bulk delete unused, replace file (keeps references), crop presets (16:10, 4:3, 1:1, OG 1200×630), max upload size from settings, auto convert HEIC to JPEG, strip EXIF location data on upload.
