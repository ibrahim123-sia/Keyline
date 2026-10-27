# 08 — CMS (Website Content) and SEO

The admin controls every word, image and link on the public site from Admin → Website.

## 1. Pages and the page builder

### Page list
Title, slug, status (draft / published / scheduled), template, last edited by, updated. Actions: edit, duplicate, preview, view, set as home, move to trash.

### Page editor
- Left: section list (drag to reorder, collapse, hide, duplicate, delete). "+ Add section" opens the section picker with thumbnails.
- Middle: **live preview** of the page at desktop / tablet / phone widths. Clicking a section in the preview selects it.
- Right: settings for the selected section (fields below), plus a "Section style" tab: background (sand / white / soft / dark ink / image), spacing (compact / normal / large), width (contained / full), anchor id, hide on phone / desktop.
- Top: title, slug, status, schedule, SEO button, Revisions, Preview link (shareable, expires in 7 days), Publish.
- Revisions: last 20 versions, compare, restore.
- Every text field in sections supports plain text; body fields use the rich text editor.

### Section types (each stored as `{ id, type, props, style }` in `pages.sections`)
| Type | Fields |
|---|---|
| **Hero with search** | eyebrow, heading, subheading, search tabs to show, default tab, image, floating badge text on/off |
| **Hero simple** | heading, subheading, image or none, up to 2 buttons |
| **Promise strip** | 2–4 items (title, text, icon) |
| **Featured listings** | heading, eyebrow, source (manual pick / featured / newest / by filter), count, layout (grid / carousel), "view all" link |
| **Projects showcase** | heading, source (manual / featured / by area), count, dark band on/off |
| **Areas grid** | heading, pick area guides or locations, count |
| **Search results embed** | saved filter set (e.g. "Villas under 5M"), count |
| **Text** | rich text, max width |
| **Text + image** | heading, rich text, image, image side, buttons |
| **Stats** | items (number, label, source note) — admin-entered only, never auto-invented |
| **Testimonials** | pick or latest, layout |
| **FAQ** | pick FAQ group or items; outputs FAQ schema |
| **Team** | pick agent profiles or all |
| **Developers logos** | pick developers |
| **Blog posts** | category or latest, count |
| **Tools** | which tools to show |
| **AI assistant teaser** | heading, text, quick prompts (list) |
| **Call to action** | heading, text, up to 2 buttons, background |
| **Contact block** | show office details, map, contact form on/off |
| **Form** | form type (contact, callback, valuation, list your property, newsletter), heading |
| **Video** | URL, poster image, caption |
| **Gallery** | images, layout |
| **Map** | center, zoom, show listings / POIs / office |
| **Divider / spacer** | size |
| **Custom HTML** | admin only, sanitized, no scripts unless a setting allows — off by default |

Every section renderer is server-rendered, has a skeleton, and works at phone width.

### Templates
- **Default:** header + sections + footer
- **Landing:** minimal header (logo + phone), no footer menus, for ad campaigns
- **Legal:** narrow text layout with a table of contents

### Seed pages
Home, About, Contact, Sell with us, Off-plan guide, Privacy policy, Terms, Cookie policy, 404 content.

## 2. Menus and footer
- **Menus:** header, mobile, footer columns 1–3. Items: label, link type (page, URL, search preset, area, project, blog category), open in new tab, children (one level for header dropdowns). Drag and drop tree.
- **Footer:** short text, logo, columns (each tied to a menu), social links (from Contact settings), legal line, licence number, newsletter on/off, "Powered by Propel" (cannot be removed in the demo build).
- **Announcement bar:** optional top bar text + link + date range.

## 3. Blog (Admin → Website → Blog)
- Post list with status, category, author, publish date, views
- Editor: title, slug, excerpt, cover image, body (Tiptap with headings, images, quotes, tables, embeds: YouTube, property card by reference, CTA button), category, tags, author (admin or agent profile), related properties, publish / schedule, SEO panel
- **AI draft:** admin gives a topic and key points → AI drafts title, outline and body using only the agency's data plus general knowledge it marks as needing a check; draft is saved as `is_ai_drafted`, never auto-published
- Categories and tags management
- Reading time computed

## 4. Area guides (Admin → Website → Area guides)
Linked to a location. Intro, rich body, cover, gallery, lifestyle highlights, admin stats with source notes, FAQs, related posts, SEO. Live counts (homes for sale/rent, average price per area from own data) are added automatically on the public page.

## 5. Testimonials, FAQs, legal
- Testimonials: name, role, quote, rating, photo, linked property, publish, order
- FAQs: question, answer (rich), group, publish, order; used by pages, area guides and the AI assistant
- Legal pages are normal pages using the Legal template

## 6. SEO (Admin → Website → SEO, plus the SEO panel on every content item)

### Per item SEO panel (pages, properties, projects, developers, area guides, posts, agents)
- Slug (editing creates an automatic 301 from the old slug)
- SEO title (with pixel-length meter) and meta description (length meter)
- **AI suggest** title and description (3 options, admin picks)
- OG image (defaults to cover; auto-generated share card for properties)
- Canonical URL (defaults to self)
- Noindex toggle
- Google result preview and WhatsApp/Facebook share preview
- Checklist: title length, description length, H1 present, image alts, internal links, word count (for pages and posts)

### Site-wide SEO
- **Sitemap index** split by type (pages, properties, projects, areas, posts, agents, developers), with `lastmod`; sold/rented listings drop out after the setting's days
- **robots.txt** from settings (staging blocks all)
- **Structured data (JSON-LD):** Organization / RealEstateAgent, WebSite with SearchAction, BreadcrumbList on every page, listing schema for properties (Product/Offer or RealEstateListing with price, currency, address locality, images), Article for posts, FAQPage where FAQs show, Place for area guides
- **Title patterns** from settings with variables
- **Redirects manager:** list, add, bulk import CSV, hit counter, automatic redirects from slug changes, warning on redirect chains and loops
- **404 monitor:** log of 404 paths with hit counts and a one-click "create redirect"
- **SEO landing pages** auto-generated for each location × purpose (× type when there are enough listings, threshold in settings) with unique H1, intro, listings and FAQs; thin pages (fewer than 3 listings) get `noindex` automatically
- **Internal linking:** property pages link to their area, project, developer and similar homes; area guides link to listings and posts
- **Performance for SEO:** server rendering, `next/image` style responsive images, no layout shift, fonts self-hosted
- **SEO report** screen: pages missing titles/descriptions, duplicate titles, missing alts, listings with fewer than 5 photos, thin pages, broken internal links (weekly crawl job)
