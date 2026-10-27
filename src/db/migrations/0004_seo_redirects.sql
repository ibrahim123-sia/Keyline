CREATE TABLE "seo_redirects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"from_path" text NOT NULL,
	"to_path" text NOT NULL,
	"type" integer DEFAULT 301 NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"last_hit_at" timestamp with time zone,
	"is_auto" boolean DEFAULT false NOT NULL,
	"source" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "seo_redirects_from_unique" ON "seo_redirects" USING btree ("agency_id","from_path");--> statement-breakpoint
CREATE INDEX "seo_redirects_to_idx" ON "seo_redirects" USING btree ("agency_id","to_path");