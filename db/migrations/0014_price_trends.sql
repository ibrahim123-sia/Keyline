CREATE TABLE "area_price_stats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"location_id" uuid NOT NULL,
	"period" date NOT NULL,
	"purpose" text NOT NULL,
	"property_type_id" uuid,
	"median_price_per_area" bigint NOT NULL,
	"currency" text NOT NULL,
	"listings_count" integer DEFAULT 0 NOT NULL,
	"deals_count" integer DEFAULT 0 NOT NULL,
	"avg_days_on_market" integer,
	"source" text NOT NULL,
	"source_note" text,
	CONSTRAINT "area_price_stats_unique" UNIQUE NULLS NOT DISTINCT("agency_id","location_id","period","purpose","property_type_id","source")
);
--> statement-breakpoint
ALTER TABLE "listing_requests" ADD COLUMN "upgrades" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_requests" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "listing_requests" ADD COLUMN "property_id" uuid;--> statement-breakpoint
ALTER TABLE "valuation_requests" ADD COLUMN "upgrades" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "valuation_requests" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "area_price_stats" ADD CONSTRAINT "area_price_stats_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_price_stats" ADD CONSTRAINT "area_price_stats_property_type_id_property_types_id_fk" FOREIGN KEY ("property_type_id") REFERENCES "public"."property_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "area_price_stats_location_idx" ON "area_price_stats" USING btree ("location_id","purpose","period");--> statement-breakpoint
CREATE INDEX "area_price_stats_period_idx" ON "area_price_stats" USING btree ("agency_id","source","period");--> statement-breakpoint
ALTER TABLE "listing_requests" ADD CONSTRAINT "listing_requests_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_requests_lead_idx" ON "listing_requests" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "valuation_requests_lead_idx" ON "valuation_requests" USING btree ("lead_id");