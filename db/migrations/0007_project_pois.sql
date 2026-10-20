CREATE TABLE "project_pois" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
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
ALTER TABLE "project_pois" ADD CONSTRAINT "project_pois_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_pois" ADD CONSTRAINT "project_pois_poi_id_pois_id_fk" FOREIGN KEY ("poi_id") REFERENCES "public"."pois"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_pois_unique" ON "project_pois" USING btree ("project_id","poi_id");--> statement-breakpoint
CREATE INDEX "project_pois_poi_idx" ON "project_pois" USING btree ("poi_id");