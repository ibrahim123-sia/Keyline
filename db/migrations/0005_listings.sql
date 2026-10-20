CREATE SEQUENCE "public"."property_reference_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE TABLE "payment_plan_steps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"payment_plan_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"stage" text NOT NULL,
	"label" text NOT NULL,
	"percent" numeric NOT NULL,
	"timing_text" text,
	"due_date" date,
	"instalments_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"summary_label" text,
	"notes" text,
	"is_template" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_facilities" (
	"project_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	CONSTRAINT "project_facilities_project_id_facility_id_pk" PRIMARY KEY("project_id","facility_id")
);
--> statement-breakpoint
CREATE TABLE "project_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"kind" text DEFAULT 'photo' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"caption" text,
	"alt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_unit_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"beds" integer,
	"baths" integer,
	"size_min" numeric,
	"size_max" numeric,
	"price_from" bigint,
	"floor_plan_id" uuid,
	"available_count" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"developer_id" uuid,
	"name" text NOT NULL,
	"location_id" uuid,
	"point" geometry(Point, 4326),
	"status" text DEFAULT 'announced' NOT NULL,
	"launch_date" date,
	"handover_date" date,
	"handover_text" text,
	"construction_progress" integer,
	"progress_updated_at" timestamp with time zone,
	"starting_price" bigint,
	"currency" text,
	"unit_types_summary" text,
	"total_units" integer,
	"description" jsonb,
	"description_html" text,
	"highlights" text[] DEFAULT '{}' NOT NULL,
	"brochure_id" uuid,
	"master_plan_id" uuid,
	"video_url" text,
	"tour_url" text,
	"payment_plan_id" uuid,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"slug" text NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"og_image_id" uuid,
	"canonical_url" text,
	"noindex" boolean DEFAULT false NOT NULL,
	"schema_override" jsonb,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"old_price" bigint,
	"new_price" bigint,
	"currency" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"reference" text NOT NULL,
	"title" text NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"completion" text DEFAULT 'ready' NOT NULL,
	"property_type_id" uuid,
	"location_id" uuid,
	"project_id" uuid,
	"project_unit_type_id" uuid,
	"address_line" text,
	"building_name" text,
	"unit_number" text,
	"floor" text,
	"point" geometry(Point, 4326),
	"map_pin_exact" boolean DEFAULT false NOT NULL,
	"price" bigint,
	"currency" text,
	"price_on_request" boolean DEFAULT false NOT NULL,
	"price_period" text,
	"price_per_area" numeric GENERATED ALWAYS AS (case when size > 0 and price is not null then round(price / size) end) STORED,
	"original_price" bigint,
	"service_charge_per_area" bigint,
	"rent_payment_options" integer[] DEFAULT '{}' NOT NULL,
	"monthly_payment_available" boolean DEFAULT false NOT NULL,
	"deposit_amount" bigint,
	"agency_fee_text" text,
	"beds" integer,
	"baths" integer,
	"size" numeric,
	"plot_size" numeric,
	"year_built" integer,
	"parking_spaces" integer,
	"furnishing" text,
	"ownership" text,
	"view" text[] DEFAULT '{}' NOT NULL,
	"floor_count" integer,
	"maid_room" boolean DEFAULT false NOT NULL,
	"study" boolean DEFAULT false NOT NULL,
	"handover_date" date,
	"handover_text" text,
	"payment_plan_id" uuid,
	"construction_progress" integer,
	"expected_rent_yearly" bigint,
	"expected_yield" numeric GENERATED ALWAYS AS (case when purpose = 'sale' and price > 0 and expected_rent_yearly is not null then round(expected_rent_yearly::numeric * 100 / price, 2) end) STORED,
	"is_tenanted" boolean DEFAULT false NOT NULL,
	"tenancy_end_date" date,
	"description" jsonb,
	"description_html" text,
	"highlights" text[] DEFAULT '{}' NOT NULL,
	"video_url" text,
	"tour_url" text,
	"permit_number" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"last_verified_at" timestamp with time zone,
	"verified_by" uuid,
	"agent_id" uuid,
	"is_featured" boolean DEFAULT false NOT NULL,
	"featured_until" timestamp with time zone,
	"published_at" timestamp with time zone,
	"views_count" integer DEFAULT 0 NOT NULL,
	"inquiries_count" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"search_text" text,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', lintel_normalize(coalesce(title, '') || ' ' || coalesce(building_name, '') || ' ' || coalesce(reference, '') || ' ' || coalesce(search_text, '')))) STORED,
	"slug" text NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"og_image_id" uuid,
	"canonical_url" text,
	"noindex" boolean DEFAULT false NOT NULL,
	"schema_override" jsonb,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "property_badges" (
	"property_id" uuid NOT NULL,
	"badge_id" uuid NOT NULL,
	"is_auto" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"reason" text,
	CONSTRAINT "property_badges_property_id_badge_id_pk" PRIMARY KEY("property_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "property_daily_stats" (
	"property_id" uuid NOT NULL,
	"date" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"inquiries" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"brochure_downloads" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "property_daily_stats_property_id_date_pk" PRIMARY KEY("property_id","date")
);
--> statement-breakpoint
CREATE TABLE "property_facilities" (
	"property_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	CONSTRAINT "property_facilities_property_id_facility_id_pk" PRIMARY KEY("property_id","facility_id")
);
--> statement-breakpoint
CREATE TABLE "property_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"kind" text DEFAULT 'photo' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"caption" text,
	"alt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_pois" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"poi_id" uuid NOT NULL,
	"straight_distance_m" integer NOT NULL,
	"drive_seconds" integer,
	"drive_distance_m" integer,
	"walk_seconds" integer,
	"walk_distance_m" integer,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_shown" boolean DEFAULT true NOT NULL,
	"is_manual_override" boolean DEFAULT false NOT NULL,
	"override_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_plan_steps" ADD CONSTRAINT "payment_plan_steps_payment_plan_id_payment_plans_id_fk" FOREIGN KEY ("payment_plan_id") REFERENCES "public"."payment_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_facilities" ADD CONSTRAINT "project_facilities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_facilities" ADD CONSTRAINT "project_facilities_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_media" ADD CONSTRAINT "project_media_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_media" ADD CONSTRAINT "project_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_unit_types" ADD CONSTRAINT "project_unit_types_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_unit_types" ADD CONSTRAINT "project_unit_types_floor_plan_id_media_id_fk" FOREIGN KEY ("floor_plan_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_brochure_id_media_id_fk" FOREIGN KEY ("brochure_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_master_plan_id_media_id_fk" FOREIGN KEY ("master_plan_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_payment_plan_id_payment_plans_id_fk" FOREIGN KEY ("payment_plan_id") REFERENCES "public"."payment_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_property_type_id_property_types_id_fk" FOREIGN KEY ("property_type_id") REFERENCES "public"."property_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_project_unit_type_id_project_unit_types_id_fk" FOREIGN KEY ("project_unit_type_id") REFERENCES "public"."project_unit_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_payment_plan_id_payment_plans_id_fk" FOREIGN KEY ("payment_plan_id") REFERENCES "public"."payment_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_badges" ADD CONSTRAINT "property_badges_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_badges" ADD CONSTRAINT "property_badges_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_daily_stats" ADD CONSTRAINT "property_daily_stats_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_facilities" ADD CONSTRAINT "property_facilities_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_facilities" ADD CONSTRAINT "property_facilities_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_pois" ADD CONSTRAINT "property_pois_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_pois" ADD CONSTRAINT "property_pois_poi_id_pois_id_fk" FOREIGN KEY ("poi_id") REFERENCES "public"."pois"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_plan_steps_plan_idx" ON "payment_plan_steps" USING btree ("payment_plan_id","sort_order");--> statement-breakpoint
CREATE INDEX "project_facilities_facility_idx" ON "project_facilities" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "project_media_project_idx" ON "project_media" USING btree ("project_id","sort_order");--> statement-breakpoint
CREATE INDEX "project_media_media_idx" ON "project_media" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "project_unit_types_project_idx" ON "project_unit_types" USING btree ("project_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_unique" ON "projects" USING btree ("agency_id","slug");--> statement-breakpoint
CREATE INDEX "projects_developer_idx" ON "projects" USING btree ("developer_id");--> statement-breakpoint
CREATE INDEX "projects_location_idx" ON "projects" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "projects_point_gist" ON "projects" USING gist ("point");--> statement-breakpoint
CREATE INDEX "projects_name_trgm" ON "projects" USING gin (lintel_normalize("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "price_history_property_idx" ON "price_history" USING btree ("property_id","changed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "properties_reference_unique" ON "properties" USING btree ("agency_id","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_slug_unique" ON "properties" USING btree ("agency_id","slug");--> statement-breakpoint
CREATE INDEX "properties_point_gist" ON "properties" USING gist ("point");--> statement-breakpoint
CREATE INDEX "properties_point_geog_gist" ON "properties" USING gist (("point"::geography));--> statement-breakpoint
CREATE INDEX "properties_search_gin" ON "properties" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "properties_title_trgm" ON "properties" USING gin (lintel_normalize("title") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "properties_building_trgm" ON "properties" USING gin (lintel_normalize(coalesce("building_name", '')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "properties_purpose_status_price_idx" ON "properties" USING btree ("agency_id","purpose","status","price");--> statement-breakpoint
CREATE INDEX "properties_location_idx" ON "properties" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "properties_beds_idx" ON "properties" USING btree ("beds");--> statement-breakpoint
CREATE INDEX "properties_agent_idx" ON "properties" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "properties_project_idx" ON "properties" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "property_badges_badge_idx" ON "property_badges" USING btree ("badge_id");--> statement-breakpoint
CREATE INDEX "property_facilities_facility_idx" ON "property_facilities" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "property_media_property_idx" ON "property_media" USING btree ("property_id","kind","sort_order");--> statement-breakpoint
CREATE INDEX "property_media_media_idx" ON "property_media" USING btree ("media_id");--> statement-breakpoint
CREATE UNIQUE INDEX "property_pois_unique" ON "property_pois" USING btree ("property_id","poi_id");--> statement-breakpoint
CREATE INDEX "property_pois_poi_idx" ON "property_pois" USING btree ("poi_id");