# 05 — Data Model

This is the starting schema. Add columns when a feature needs them, and write the reason in `PROGRESS.md`. Ask before removing or renaming anything here.

## Common columns
Every main table has: `id` (uuid v7), `agency_id` (uuid), `created_at`, `updated_at`, `created_by`, `updated_by`.
Content tables also have `deleted_at` (soft delete).
SEO-able tables have an embedded **SEO block**: `slug` (unique per type), `seo_title`, `seo_description`, `og_image_id`, `canonical_url`, `noindex` (bool), `schema_override` (jsonb, optional).

Units: money in minor units (`bigint`) + `currency` code; area in m² (`numeric`); distance in metres (`integer`); durations in seconds.

---

## 1. Identity and settings
**users** (Better Auth managed + extra): `name`, `email`, `email_verified`, `phone`, `image`, `role` (admin | customer), `is_active`, `two_factor_enabled`, `admin_theme` (light | dark), `notify_prefs` (jsonb), `last_login_at`.
**sessions**, **accounts**, **verifications** — Better Auth tables.
**settings**: `group` (general | branding | market | contact | leads | viewings | seo | integrations | ai | notifications | legal | security), `value` (jsonb), unique (`agency_id`, `group`).
**secrets**: `key`, `encrypted_value`, `last_tested_at`, `last_error` — integration keys, encrypted at rest.
**audit_log**: `actor_type` (admin | ai | system), `actor_id`, `action`, `entity_type`, `entity_id`, `before` (jsonb), `after` (jsonb), `ip`, `user_agent`, `created_at`.

## 2. People
**agents** (profiles, not users): `name`, `slug`, `title`, `photo_id`, `phone`, `whatsapp`, `email`, `languages` (text[]), `areas` (location ids), `bio`, `is_active`, `sort_order`, `calendar_connected` (bool), `google_calendar_id`, `working_hours` (jsonb).

## 3. Master data
**locations**: `parent_id`, `level` (country | city | area | community | building), `name`, `slug`, `geom` (PostGIS polygon, optional), `center` (PostGIS point), `description`, `is_featured`, SEO block.
**property_types**: `name`, `slug`, `category` (residential | commercial | land), `icon`, `sort_order`, `fields_hidden` (jsonb: e.g. land hides beds/baths).
**facilities**: `name`, `icon`, `group` (building | unit | community), `sort_order`.
**badges**: `name`, `color`, `text_color`, `icon`, `auto_rule` (none | price_reduced | new_listing | verified | off_plan), `auto_days` (e.g. "new" for 14 days), `sort_order`.
**poi_types**: `name`, `icon`, `default_search_radius_m`, `show_on_property` (bool), `travel_mode` (drive | walk), `sort_order`. Examples: School, Nursery, Hospital, Clinic, Mall, Supermarket, Metro, Bus, Beach, Park, Mosque/Church, Airport, Business district, Gym.
**pois**: `poi_type_id`, `name`, `address`, `point` (PostGIS), `google_place_id`, `website`, `rating_note` (optional, admin text), `is_active`.
**developers**: `name`, `slug`, `logo_id`, `description`, `website`, `established_year`, SEO block.

## 4. Projects (off-plan developments)
**projects**: `developer_id`, `name`, `slug`, `location_id`, `point`, `status` (announced | under_construction | completed), `launch_date`, `handover_date` (or quarter text), `construction_progress` (0–100), `progress_updated_at`, `starting_price`, `currency`, `unit_types_summary` (text), `total_units`, `description` (rich), `highlights` (text[]), `brochure_id`, `master_plan_id`, `video_url`, `tour_url`, `payment_plan_id`, `is_featured`, `is_published`, SEO block.
**project_facilities**, **project_media** (same shape as property media).
**project_unit_types**: `project_id`, `name` (e.g. "2 bed type B"), `beds`, `baths`, `size_min`, `size_max`, `price_from`, `floor_plan_id`, `available_count`.

## 5. Properties
**properties**:
- Basics: `reference` (auto, e.g. HD-2041, unique), `title`, `slug`, `purpose` (sale | rent), `status` (draft | available | reserved | under_offer | sold | rented | off_market), `completion` (ready | off_plan), `property_type_id`, `location_id`, `project_id` (nullable), `project_unit_type_id` (nullable), `address_line`, `building_name`, `unit_number` (private, never public), `floor`, `point` (PostGIS), `map_pin_exact` (bool — if false, public map shows an approximate circle).
- Price: `price`, `currency`, `price_on_request` (bool), `price_period` (null for sale; year | month for rent), `price_per_area` (generated), `original_price` (for "price reduced"), `service_charge_per_area`, `rent_payment_options` (int[] number of payments), `monthly_payment_available` (bool), `deposit_amount`, `agency_fee_text`.
- Specs: `beds` (0 = studio), `baths`, `size`, `plot_size`, `year_built`, `parking_spaces`, `furnishing`, `ownership`, `view` (text[] e.g. sea, marina, city), `floor_count` (villas), `maid_room` (bool), `study` (bool).
- Off-plan: `handover_date`, `payment_plan_id`, `construction_progress` (inherits from project if linked).
- Investor: `expected_rent_yearly`, `expected_yield` (generated if both prices known), `is_tenanted`, `tenancy_end_date`.
- Content: `description` (rich JSON + HTML), `highlights` (text[]), `video_url`, `tour_url`.
- Trust: `permit_number`, `is_verified`, `last_verified_at`, `verified_by`.
- Ops: `agent_id`, `is_featured`, `featured_until`, `published_at`, `views_count`, `inquiries_count`, `source` (manual | import | ai_draft).
- SEO block.
- Indexes: GiST on `point`, GIN on search vector (`title`, `description`, `building_name`, location names), trigram on `title` and `building_name`, b-tree on (`purpose`, `status`, `price`), (`location_id`), (`beds`).

**property_media**: `property_id`, `media_id`, `kind` (photo | floor_plan | video | brochure | document), `sort_order`, `is_cover`, `caption`, `alt`.
**property_facilities**: `property_id`, `facility_id`.
**property_badges**: `property_id`, `badge_id`, `is_auto`.
**property_pois**: `property_id`, `poi_id`, `straight_distance_m`, `drive_seconds`, `drive_distance_m`, `walk_seconds`, `walk_distance_m`, `computed_at`, `is_shown`, `is_manual_override`, `override_text`, `sort_order`.
**price_history**: `property_id`, `old_price`, `new_price`, `currency`, `changed_at`, `changed_by`.
**property_daily_stats**: `property_id`, `date`, `views`, `saves`, `inquiries`, `shares`, `brochure_downloads`.

## 6. Payment plans
**payment_plans**: `name`, `summary_label` (e.g. "60/40", "70/30 post-handover"), `notes`.
**payment_plan_steps**: `payment_plan_id`, `sort_order`, `stage` (booking | construction | handover | post_handover), `label`, `percent` (numeric), `timing_text` (e.g. "In 8 instalments to 2027", "Monthly over 24 months"), `due_date` (optional), `instalments_count` (optional).
Rule: sum of `percent` must be exactly 100 to publish.

## 7. Media
**media**: `r2_key`, `file_name`, `mime`, `size_bytes`, `width`, `height`, `alt`, `caption`, `folder`, `uploaded_by`, `blurhash` or dominant color, `used_count` (generated by references).

## 8. CMS and content
**pages**: `title`, `slug`, `status` (draft | published | scheduled), `publish_at`, `template` (default | landing | legal), `sections` (jsonb array — see `08-cms-and-seo.md`), `is_home` (only one), SEO block, `version`.
**page_revisions**: `page_id`, `sections`, `seo`, `created_by`, `created_at` (keep last 20).
**menus**: `location` (header | footer_1 | footer_2 | footer_3 | mobile), `items` (jsonb tree: label, type page|url|listing_search|area|custom, target, open_new_tab).
**posts**: `title`, `slug`, `excerpt`, `body` (rich), `cover_id`, `author_id` (agent or admin), `category_id`, `status`, `publish_at`, `reading_minutes` (generated), `related_property_ids`, `is_ai_drafted`, SEO block.
**post_categories**, **post_tags**, **post_tag_links**.
**area_guides**: `location_id`, `title`, `slug`, `intro`, `body` (rich), `cover_id`, `gallery`, `highlights` (lifestyle bullets), `stats` (jsonb, admin-entered, each with source text), `faqs`, `status`, SEO block.
**testimonials**: `name`, `role_text`, `quote`, `rating`, `photo_id`, `property_id` (optional), `is_published`, `sort_order`.
**faqs**: `question`, `answer`, `group` (buying | renting | off_plan | selling | general), `sort_order`, `is_published`.
**seo_redirects**: `from_path`, `to_path`, `type` (301 | 302), `hits`, `last_hit_at`, `is_auto`.

## 9. Visitors and attribution
**visitors**: `visitor_id` (first-party cookie value), `first_seen_at`, `last_seen_at`, `user_id` (if they sign in), `lead_id` (once known), `first_touch` (jsonb), `last_touch` (jsonb), `consent` (necessary | analytics | marketing flags), `device`, `country` (from Cloudflare header).
Touch JSON: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`, `referrer`, `landing_path`, `channel` (computed: paid_search | paid_social | organic_search | organic_social | email | referral | direct | portal | offline_qr), `at`.
**visitor_events**: `visitor_id`, `type` (page_view | listing_view | search | save | share | brochure | tool_use | chat_start | form_start | form_submit | whatsapp_click | call_click), `path`, `entity_type`, `entity_id`, `meta` (jsonb), `created_at`. Keep 180 days, then roll up.
**utm_links**: `name`, `base_url`, `utm_*` fields, `short_code`, `qr_svg_key`, `clicks`, `created_by`.

## 10. Leads and CRM
**contacts**: `name`, `email`, `phone` (E.164), `whatsapp`, `nationality` (optional, only if lead gives it), `preferred_contact` (whatsapp | call | email), `preferred_language`, `user_id` (if customer), `marketing_consent` (bool + date), `tags` (text[]).
**leads**: `contact_id`, `type` (buyer | tenant | seller | landlord | investor), `stage_id`, `status` (open | won | lost), `lost_reason`, `source` (form | chat | whatsapp | tour | callback | call_click | mortgage | roi | brochure | valuation | listing_request | signup | saved_search | newsletter | portal | social_form | manual | import | qr), `source_detail` (e.g. portal name, form name), `first_touch`, `last_touch` (jsonb copies at creation), `visitor_id`, `property_ids` (interest), `project_ids`, `requirements` (jsonb: purpose, budget_min, budget_max, location_ids, property_type_ids, beds_min, timeline, finance: cash | mortgage | unknown, move_in_date, notes), `ai_score` (0–100), `ai_summary`, `ai_scored_at`, `agent_id`, `first_response_at`, `response_seconds` (generated), `last_activity_at`, `next_task_at`, `deal_value`, `won_at`, `lost_at`, `merged_into_id`.
**lead_stages**: `name`, `sort_order`, `color`, `kind` (open | won | lost).
**lead_events** (timeline): `lead_id`, `type` (created | stage_changed | note | call | email_sent | email_received | whatsapp_in | whatsapp_out | chat | viewing_booked | viewing_done | task_done | assigned | merged | ai_summary | property_sent | brochure_sent), `body`, `meta` (jsonb), `actor_type`, `actor_id`, `created_at`.
**lead_tasks**: `lead_id`, `title`, `due_at`, `done_at`, `agent_id`, `created_by` (admin | ai | rule).
**valuation_requests**: `contact_id`, `lead_id`, `purpose` (sell | rent), `property_type_id`, `location_id`, `building`, `beds`, `baths`, `size`, `condition`, `notes`, `ai_range_min`, `ai_range_max`, `ai_comparables` (property ids), `photos` (media ids).
**listing_requests**: same as valuation, plus `asking_price`, `available_from`.

## 11. Viewings
**viewings**: `lead_id`, `contact_id`, `property_id` or `project_id`, `agent_id`, `type` (in_person | video), `starts_at`, `ends_at`, `status` (requested | confirmed | done | no_show | cancelled | rescheduled), `meeting_url`, `google_event_id`, `notes`, `feedback_rating` (1–5), `feedback_text`, `reminder_sent_at`, `source` (site | chat | whatsapp | admin).
**agent_availability_overrides**: `agent_id`, `date`, `blocked` or custom hours.

## 12. Conversations
**conversations**: `channel` (web_chat | whatsapp | email), `contact_id`, `visitor_id`, `lead_id`, `status` (ai | human | closed), `assigned_admin_id`, `last_message_at`, `ai_summary`, `wa_window_expires_at`.
**messages**: `conversation_id`, `direction` (in | out), `sender` (customer | ai | admin | system), `body`, `attachments`, `tool_calls` (jsonb, for AI), `status` (sent | delivered | read | failed), `external_id`, `created_at`.
**approval_queue**: `conversation_id`, `draft_reply`, `reason` (topic needs human), `status` (pending | approved | edited | rejected), `decided_by`, `decided_at`.

## 13. Customer features
**saved_lists**: `user_id`, `name`, `is_default`.
**saved_homes**: `user_id`, `list_id`, `property_id` or `project_id`, `note`, `created_at`.
**saved_searches**: `user_id`, `name`, `filters` (jsonb, same shape as search URL), `polygon` (PostGIS, optional), `alert_frequency` (instant | daily | weekly | off), `last_sent_at`.
**alerts_sent**: `saved_search_id` or `saved_home_id`, `property_id`, `kind` (new_match | price_drop | status_change), `sent_at`.
**compare_sets**: `user_id` or `visitor_id`, `property_ids` (max 4).
**newsletter_subscribers**: `email`, `confirmed_at`, `unsubscribed_at`, `source`.

## 14. AI
**embeddings**: `entity_type` (property | project | page | post | area_guide | faq | developer), `entity_id`, `chunk_index`, `content`, `embedding` (vector), `updated_at`. HNSW index.
**ai_actions**: `admin_id`, `conversation_ref`, `tool`, `input` (jsonb), `preview` (jsonb — before/after), `status` (proposed | confirmed | rejected | executed | failed), `result`, `confirmed_at`, `executed_at`, `source` (admin_chat | mcp).
**ai_usage**: `date`, `feature` (customer_chat | whatsapp | admin_chat | description | seo | blog | valuation | scoring), `requests`, `input_tokens`, `output_tokens`, `cost_estimate`.

## 15. Stats and reports
**daily_metrics**: `date`, `leads_by_source` (jsonb), `leads_by_channel`, `viewings`, `won`, `deal_value`, `avg_response_seconds`, `site_visits`, `listing_views`.
**area_price_stats**: `location_id`, `period` (month), `purpose`, `property_type_id`, `median_price_per_area`, `listings_count`, `source` (agency_data | admin_entered), `source_note`.
