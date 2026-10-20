-- Re-define the search helper schema-qualified (PostgreSQL 17+ builds indexes with a
-- restricted search_path, so unqualified calls fail inside index expressions).
CREATE OR REPLACE FUNCTION lintel_normalize(input text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT lower(public.lintel_unaccent(input)) $$;--> statement-breakpoint
CREATE TABLE "badges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"color" text DEFAULT '#F3E6DF' NOT NULL,
	"text_color" text DEFAULT '#14232B' NOT NULL,
	"icon" text,
	"auto_rule" text DEFAULT 'none' NOT NULL,
	"auto_days" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"logo_id" uuid,
	"description" text,
	"website" text,
	"established_year" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
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
CREATE TABLE "facilities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"icon" text,
	"group" text DEFAULT 'building' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"color" text DEFAULT '#5B6670' NOT NULL,
	"kind" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"parent_id" uuid,
	"level" text NOT NULL,
	"name" text NOT NULL,
	"geom" geometry(Geometry, 4326),
	"center" geometry(Point, 4326),
	"description" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"slug" text NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"og_image_id" uuid,
	"canonical_url" text,
	"noindex" boolean DEFAULT false NOT NULL,
	"schema_override" jsonb
);
--> statement-breakpoint
CREATE TABLE "poi_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"icon" text,
	"category" text DEFAULT 'other' NOT NULL,
	"google_place_type" text,
	"default_search_radius_m" integer DEFAULT 3000 NOT NULL,
	"show_on_property" boolean DEFAULT true NOT NULL,
	"travel_mode" text DEFAULT 'drive' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pois" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"poi_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"point" geometry(Point, 4326) NOT NULL,
	"google_place_id" text,
	"website" text,
	"rating_note" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plural_name" text,
	"category" text DEFAULT 'residential' NOT NULL,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"fields_hidden" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "crops" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_locations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pois" ADD CONSTRAINT "pois_poi_type_id_poi_types_id_fk" FOREIGN KEY ("poi_type_id") REFERENCES "public"."poi_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "developers_slug_unique" ON "developers" USING btree ("agency_id","slug");--> statement-breakpoint
CREATE INDEX "developers_name_trgm" ON "developers" USING gin (lintel_normalize("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "facilities_group_idx" ON "facilities" USING btree ("agency_id","group","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_slug_unique" ON "locations" USING btree ("agency_id","slug");--> statement-breakpoint
CREATE INDEX "locations_parent_idx" ON "locations" USING btree ("parent_id","sort_order");--> statement-breakpoint
CREATE INDEX "locations_center_gist" ON "locations" USING gist ("center");--> statement-breakpoint
CREATE INDEX "locations_geom_gist" ON "locations" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "locations_name_trgm" ON "locations" USING gin (lintel_normalize("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "pois_point_gist" ON "pois" USING gist ("point");--> statement-breakpoint
CREATE INDEX "pois_point_geog_gist" ON "pois" USING gist (("point"::geography));--> statement-breakpoint
CREATE INDEX "pois_type_idx" ON "pois" USING btree ("poi_type_id","is_active");--> statement-breakpoint
CREATE INDEX "pois_name_trgm" ON "pois" USING gin (lintel_normalize("name") gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "pois_google_place_unique" ON "pois" USING btree ("agency_id","google_place_id") WHERE "pois"."google_place_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "property_types_slug_unique" ON "property_types" USING btree ("agency_id","slug");