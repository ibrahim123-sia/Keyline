CREATE TABLE "alerts_sent" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"saved_search_id" uuid,
	"saved_home_id" uuid,
	"property_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compare_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"user_id" uuid,
	"visitor_key" text,
	"property_ids" uuid[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"new_match" jsonb DEFAULT '{"email":true,"whatsapp":false}'::jsonb NOT NULL,
	"price_drop" jsonb DEFAULT '{"email":true,"whatsapp":false}'::jsonb NOT NULL,
	"status_change" jsonb DEFAULT '{"email":true,"whatsapp":false}'::jsonb NOT NULL,
	"whatsapp_opt_in_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_homes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"property_id" uuid,
	"project_id" uuid,
	"note" text,
	"price_when_saved" bigint,
	"status_when_saved" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_lists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"share_token" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"polygon" geometry(Geometry, 4326),
	"alert_frequency" text DEFAULT 'daily' NOT NULL,
	"last_sent_at" timestamp with time zone,
	"unsubscribe_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts_sent" ADD CONSTRAINT "alerts_sent_saved_search_id_saved_searches_id_fk" FOREIGN KEY ("saved_search_id") REFERENCES "public"."saved_searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts_sent" ADD CONSTRAINT "alerts_sent_saved_home_id_saved_homes_id_fk" FOREIGN KEY ("saved_home_id") REFERENCES "public"."saved_homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts_sent" ADD CONSTRAINT "alerts_sent_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compare_sets" ADD CONSTRAINT "compare_sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_preferences" ADD CONSTRAINT "customer_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_homes" ADD CONSTRAINT "saved_homes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_homes" ADD CONSTRAINT "saved_homes_list_id_saved_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."saved_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_homes" ADD CONSTRAINT "saved_homes_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_homes" ADD CONSTRAINT "saved_homes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_lists" ADD CONSTRAINT "saved_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_sent_search_unique" ON "alerts_sent" USING btree ("saved_search_id","property_id","kind","detail") WHERE saved_search_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_sent_home_unique" ON "alerts_sent" USING btree ("saved_home_id","property_id","kind","detail") WHERE saved_home_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "compare_sets_user_unique" ON "compare_sets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "compare_sets_visitor_unique" ON "compare_sets" USING btree ("agency_id","visitor_key");--> statement-breakpoint
CREATE INDEX "saved_homes_user_idx" ON "saved_homes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "saved_homes_property_idx" ON "saved_homes" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_homes_list_property_unique" ON "saved_homes" USING btree ("list_id","property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_homes_list_project_unique" ON "saved_homes" USING btree ("list_id","project_id");--> statement-breakpoint
CREATE INDEX "saved_lists_user_idx" ON "saved_lists" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_lists_share_unique" ON "saved_lists" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "saved_searches_user_idx" ON "saved_searches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_searches_frequency_idx" ON "saved_searches" USING btree ("agency_id","alert_frequency");