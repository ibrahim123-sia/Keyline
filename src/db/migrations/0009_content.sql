CREATE TABLE "area_guide_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"guide_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"caption" text,
	"alt" text
);
--> statement-breakpoint
CREATE TABLE "area_guides" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"location_id" uuid NOT NULL,
	"title" text NOT NULL,
	"intro" text,
	"body" jsonb,
	"body_html" text,
	"cover_id" uuid,
	"highlights" text[] DEFAULT '{}' NOT NULL,
	"stats" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_post_ids" uuid[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
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
CREATE TABLE "faqs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"question" text NOT NULL,
	"answer" jsonb NOT NULL,
	"answer_html" text NOT NULL,
	"group" text DEFAULT 'general' NOT NULL,
	"area_guide_id" uuid,
	"is_published" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"location" text NOT NULL,
	"title" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "not_found_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"path" text NOT NULL,
	"hits" integer DEFAULT 1 NOT NULL,
	"last_referrer" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "post_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"description" text,
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
CREATE TABLE "post_tag_links" (
	"post_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "post_tag_links_post_id_tag_id_pk" PRIMARY KEY("post_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "post_tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"title" text NOT NULL,
	"excerpt" text,
	"body" jsonb,
	"body_html" text,
	"cover_id" uuid,
	"author_agent_id" uuid,
	"author_user_id" uuid,
	"category_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"reading_minutes" integer DEFAULT 1 NOT NULL,
	"related_property_ids" uuid[] DEFAULT '{}' NOT NULL,
	"is_ai_drafted" boolean DEFAULT false NOT NULL,
	"views_count" integer DEFAULT 0 NOT NULL,
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
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"role_text" text,
	"quote" text NOT NULL,
	"rating" integer,
	"photo_id" uuid,
	"property_id" uuid,
	"is_published" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "draft_sections" jsonb;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "draft_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "area_guide_media" ADD CONSTRAINT "area_guide_media_guide_id_area_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."area_guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_guide_media" ADD CONSTRAINT "area_guide_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_guides" ADD CONSTRAINT "area_guides_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_guides" ADD CONSTRAINT "area_guides_cover_id_media_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_area_guide_id_area_guides_id_fk" FOREIGN KEY ("area_guide_id") REFERENCES "public"."area_guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tag_links" ADD CONSTRAINT "post_tag_links_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tag_links" ADD CONSTRAINT "post_tag_links_tag_id_post_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."post_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_cover_id_media_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_category_id_post_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."post_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "area_guide_media_guide_idx" ON "area_guide_media" USING btree ("guide_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "area_guides_slug_unique" ON "area_guides" USING btree ("agency_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "area_guides_location_unique" ON "area_guides" USING btree ("agency_id","location_id");--> statement-breakpoint
CREATE INDEX "faqs_group_idx" ON "faqs" USING btree ("agency_id","group","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "menus_location_unique" ON "menus" USING btree ("agency_id","location");--> statement-breakpoint
CREATE UNIQUE INDEX "not_found_log_path_unique" ON "not_found_log" USING btree ("agency_id","path");--> statement-breakpoint
CREATE INDEX "not_found_log_hits_idx" ON "not_found_log" USING btree ("agency_id","hits");--> statement-breakpoint
CREATE UNIQUE INDEX "post_categories_slug_unique" ON "post_categories" USING btree ("agency_id","slug");--> statement-breakpoint
CREATE INDEX "post_tag_links_tag_idx" ON "post_tag_links" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_tags_slug_unique" ON "post_tags" USING btree ("agency_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_slug_unique" ON "posts" USING btree ("agency_id","slug");--> statement-breakpoint
CREATE INDEX "posts_status_idx" ON "posts" USING btree ("agency_id","status","published_at");--> statement-breakpoint
CREATE INDEX "posts_category_idx" ON "posts" USING btree ("category_id");