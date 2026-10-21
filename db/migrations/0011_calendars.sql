CREATE TABLE "calendar_busy" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"agent_id" uuid NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"account_email" text,
	"encrypted_refresh_token" text NOT NULL,
	"encrypted_access_token" text,
	"access_token_expires_at" timestamp with time zone,
	"scope" text,
	"watch_channel_id" text,
	"watch_resource_id" text,
	"watch_expires_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "calendar_busy" ADD CONSTRAINT "calendar_busy_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_busy_agent_time_idx" ON "calendar_busy" USING btree ("agent_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_connections_agent_unique" ON "calendar_connections" USING btree ("agent_id","provider");