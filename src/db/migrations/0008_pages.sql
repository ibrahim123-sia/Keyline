CREATE TABLE "page_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"sections" jsonb NOT NULL,
	"seo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"publish_at" timestamp with time zone,
	"template" text DEFAULT 'default' NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_home" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
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
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_revisions_page_idx" ON "page_revisions" USING btree ("page_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "pages_slug_unique" ON "pages" USING btree ("agency_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_home_unique" ON "pages" USING btree ("agency_id") WHERE "pages"."is_home" and "pages"."deleted_at" is null;