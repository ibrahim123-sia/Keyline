# 02 — Design System: Desert Modern

The look is clean, calm and professional. Lots of white space. Nothing should feel crowded.
The approved mockups (home, search, property page, admin dashboard, style guide) are the visual reference.

## 1. Principles

1. **Photos first.** Big images, short text. Photos carry the page.
2. **Breathing room.** Generous spacing between sections (96–120px on desktop, 64px on phone).
3. **One accent.** Terracotta is the only strong color. Use it for the main action on each screen, not everywhere.
4. **Clear numbers.** Prices, beds, baths and size are always easy to find and scan.
5. **Trust is visible.** Verified badge, last verified date, permit number, agent photo and reply time are shown where people decide.
6. **Mobile-first.** Design every screen for 390px wide first, then grow.
7. **Calm admin.** The admin portal is a work tool: neutral, compact, fast. No decoration.

## 2. Tokens (public site)

All tokens are CSS variables. Defaults below. The admin can change them in Settings → Branding (`04-settings.md`). Changing a token updates the whole site without code changes.

### Colors
| Token | Default | Use |
|---|---|---|
| `--color-bg` | `#F7F3EE` | Page background (sand) |
| `--color-surface` | `#FFFFFF` | Cards, forms, panels |
| `--color-surface-soft` | `#FBF9F6` | Inputs, soft bands |
| `--color-surface-muted` | `#EDE5DA` | CTA blocks, chips |
| `--color-ink` | `#14232B` | Main text, dark sections, footer |
| `--color-ink-soft` | `#1C2F38` | Cards on dark sections |
| `--color-text` | `#4A5560` | Body text |
| `--color-text-muted` | `#5B6670` | Labels, meta, captions |
| `--color-border` | `#E6DED3` | Borders, dividers |
| `--color-accent` | `#A9502F` | Main buttons, active states, links on hover |
| `--color-accent-soft` | `#F3E6DF` | Accent icon tiles, light badges |
| `--color-success` | `#4F6B57` | Verified, success |
| `--color-success-soft` | `#E3EBE4` | Verified badge background |
| `--color-danger` | `#B4402A` | Errors |
| `--color-photo-placeholder` | `#DCD3C6` | Image loading placeholder |

Rule: any text color on any background must reach 4.5:1 contrast. The branding editor must warn the admin if a chosen color fails.

### Typography
| Token | Default |
|---|---|
| `--font-display` | Fraunces (serif), weights 400 and 500 |
| `--font-body` | Manrope, weights 400, 500, 600, 700 |

| Style | Desktop | Phone | Font |
|---|---|---|---|
| Display (hero) | 64px / 1.05 | 40px | display 400 |
| H1 page title | 46px / 1.1 | 32px | display 400 |
| H2 section | 44px / 1.1 | 30px | display 400 |
| H3 card title | 24–26px | 20px | display 500 |
| Price | 22px bold (cards), 32px (property page) | 20 / 26px | body 700 |
| Body | 16–17px / 1.6 | 16px | body 400 |
| Label / meta | 13–14px | 13px | body 500–600 |
| Eyebrow | 13px, uppercase, 0.14em tracking | same | body 600 |

Fonts are loaded with `next/font` (self-hosted, no layout shift). Admin can pick other Google Fonts in Branding.

### Spacing, radius, shadow
- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 96, 120
- Container: max width 1200px (search page 1360px), side padding 32px desktop, 20px phone
- Radius: inputs 12px, buttons 14px (pill buttons full round), cards 20px, big images 24–28px, chips full round
- Shadows: only two. Soft `0 12px 40px rgba(20,35,43,0.06)` for floating cards, pin `0 4px 14px rgba(20,35,43,0.16)` for map pins and floating buttons

## 3. Admin tokens

| Token | Default |
|---|---|
| Background | `#F5F6F7` |
| Surface | `#FFFFFF` |
| Text | `#1F2A30` |
| Muted text | `#66727A` |
| Border | `#E5E8EB` |
| Accent | same as site accent |
| Font | Manrope only, 14px base |

Admin has **light and dark mode** (user preference, saved per admin user). Dark: background `#11181C`, surface `#192227`, text `#E7ECEF`, border `#2A353B`.

## 4. Components (build these once, reuse everywhere)

**Public:** Button (primary terracotta, dark pill, outline, ghost, sizes md/lg), Chip, Badge (from badge master data: color + icon), PropertyCard (vertical), PropertyRow (horizontal, search list), ProjectCard, AreaCard, PostCard, PriceTag (handles currency switch, "from", "price on request", per month / per year), FactsBar, FacilityItem, POIRow (name, type, distance, time), PaymentPlanSteps, Gallery + Lightbox, MapView, MapPin (price pill), SearchBar (tabs Buy/Rent/Off-plan + fields), FilterBar, FilterSheet (phone), Pagination, Breadcrumb, StickyContactCard, ChatWidget, CookieBanner, CurrencySwitcher, EmptyState, Skeletons for every card.

**Admin:** Sidebar, TopBar with assistant input, DataTable (sort, filter, column picker, bulk actions, saved views), FormSection, MediaPicker, MapPinPicker, RichTextEditor, SEOPanel (with Google preview and share preview), StatusPill, KPI tile, Kanban board, Calendar, Timeline, ConfirmDialog, AIActionPreview (diff view), Toasts, Empty states.

## 5. Page layouts (public)

- **Header:** logo left, main menu center, currency switcher + sign in + "List your property" right. On phone: logo + menu button, menu opens a full-screen sheet. Header is sticky with a white background after scroll.
- **Home:** sections from the page builder. Default order: hero with search, promise strip, featured homes, off-plan projects (dark band), area guides, AI assistant teaser, tools, insights, seller CTA, footer.
- **Search results:** filter bar at top, list left (flex 999) and map right (sticky on desktop). Phone: list with a floating "Map" button that switches to a full map view.
- **Property page:** breadcrumb, badges + title + address, gallery (1 big + 4 small), then two columns: content left, sticky contact card right. On phone the contact card becomes a bottom bar with "Book a tour" and "WhatsApp".
- **Project page:** hero image, key facts (developer, handover, starting price, payment plan), progress bar, units table, payment plan, amenities, location, brochure, contact card.
- **Footer:** dark ink, logo + short text, link columns from settings, legal links, licence number, "Powered by Keyline".

## 6. States every screen needs

Loading (skeletons, never spinners on full pages), empty (helpful text + one action), error (plain words + retry), no results (suggest removing filters, show nearby areas), offline form submit (keep the data, retry).

## 7. Motion

Subtle only: 150–200ms fades and small lifts on hover. Respect `prefers-reduced-motion`. No parallax, no auto-playing carousels.

## 8. Imagery rules

- Property photos: 4:3 in cards, 16:10 for the main gallery image
- Always `alt` text (admin fills it, AI can suggest it)
- Use responsive sizes and modern formats through Cloudflare image resizing
- Placeholder color while loading: `--color-photo-placeholder`
