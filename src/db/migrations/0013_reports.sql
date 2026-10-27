CREATE TABLE "report_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"recipients" text[] DEFAULT '{}' NOT NULL,
	"email_count" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "report_deliveries_period_unique" ON "report_deliveries" USING btree ("agency_id","kind","period_start");--> statement-breakpoint
CREATE INDEX "report_deliveries_sent_idx" ON "report_deliveries" USING btree ("agency_id","sent_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_won_idx" ON "leads" USING btree ("agency_id","won_at") WHERE "leads"."won_at" is not null;