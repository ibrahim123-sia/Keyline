CREATE TABLE "agent_availability_overrides" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"date" date NOT NULL,
	"blocked" boolean DEFAULT true NOT NULL,
	"hours" jsonb,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "approval_queue" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"draft_reply" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"whatsapp" text,
	"nationality" text,
	"preferred_contact" text,
	"preferred_language" text,
	"user_id" uuid,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"marketing_consent_at" timestamp with time zone,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"merged_into_id" uuid
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"channel" text NOT NULL,
	"contact_id" uuid,
	"visitor_id" uuid,
	"lead_id" uuid,
	"status" text DEFAULT 'ai' NOT NULL,
	"assigned_admin_id" uuid,
	"external_id" text,
	"subject" text,
	"last_message_at" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"ai_summary" text,
	"wa_window_expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lead_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" text NOT NULL,
	"body" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_type" text DEFAULT 'system' NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"lead_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"agent_id" uuid,
	"created_by_kind" text DEFAULT 'admin' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"contact_id" uuid NOT NULL,
	"type" text DEFAULT 'buyer' NOT NULL,
	"stage_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"lost_reason" text,
	"source" text NOT NULL,
	"source_detail" text,
	"first_touch" jsonb,
	"last_touch" jsonb,
	"visitor_id" uuid,
	"property_ids" uuid[] DEFAULT '{}' NOT NULL,
	"project_ids" uuid[] DEFAULT '{}' NOT NULL,
	"requirements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ai_score" integer,
	"ai_summary" text,
	"ai_score_reason" text,
	"ai_scored_at" timestamp with time zone,
	"agent_id" uuid,
	"first_response_at" timestamp with time zone,
	"response_seconds" integer GENERATED ALWAYS AS (case when first_response_at is not null then extract(epoch from first_response_at - created_at)::int end) STORED,
	"response_due_at" timestamp with time zone,
	"response_alert_sent_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_task_at" timestamp with time zone,
	"deal_value" bigint,
	"deal_currency" text,
	"won_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"merged_into_id" uuid
);
--> statement-breakpoint
CREATE TABLE "listing_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"contact_id" uuid NOT NULL,
	"lead_id" uuid,
	"purpose" text NOT NULL,
	"property_type_id" uuid,
	"location_id" uuid,
	"building" text,
	"beds" integer,
	"baths" integer,
	"size" numeric,
	"condition" text,
	"notes" text,
	"ai_range_min" bigint,
	"ai_range_max" bigint,
	"ai_comparable_ids" uuid[] DEFAULT '{}' NOT NULL,
	"photo_ids" uuid[] DEFAULT '{}' NOT NULL,
	"asking_price" bigint,
	"available_from" date
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"channel" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"wa_template_name" text,
	"wa_language" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"sender" text NOT NULL,
	"sender_admin_id" uuid,
	"body" text DEFAULT '' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"external_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"email" text NOT NULL,
	"contact_id" uuid,
	"source" text,
	"confirm_token_hash" text,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quick_replies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shortlists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"lead_id" uuid NOT NULL,
	"token" text NOT NULL,
	"title" text,
	"message" text,
	"property_ids" uuid[] DEFAULT '{}' NOT NULL,
	"sent_at" timestamp with time zone,
	"open_count" integer DEFAULT 0 NOT NULL,
	"first_opened_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone,
	"viewed_property_ids" uuid[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "utm_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"utm_source" text NOT NULL,
	"utm_medium" text NOT NULL,
	"utm_campaign" text NOT NULL,
	"utm_term" text,
	"utm_content" text,
	"short_code" text NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"last_clicked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "valuation_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"contact_id" uuid NOT NULL,
	"lead_id" uuid,
	"purpose" text NOT NULL,
	"property_type_id" uuid,
	"location_id" uuid,
	"building" text,
	"beds" integer,
	"baths" integer,
	"size" numeric,
	"condition" text,
	"notes" text,
	"ai_range_min" bigint,
	"ai_range_max" bigint,
	"ai_comparable_ids" uuid[] DEFAULT '{}' NOT NULL,
	"photo_ids" uuid[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "viewings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"lead_id" uuid,
	"contact_id" uuid NOT NULL,
	"property_id" uuid,
	"project_id" uuid,
	"agent_id" uuid,
	"type" text DEFAULT 'in_person' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"meeting_url" text,
	"google_event_id" text,
	"notes" text,
	"visitor_time_zone" text,
	"feedback_rating" integer,
	"feedback_text" text,
	"feedback_requested_at" timestamp with time zone,
	"reminder_day_sent_at" timestamp with time zone,
	"reminder_hours_sent_at" timestamp with time zone,
	"manage_token_hash" text,
	"source" text DEFAULT 'site' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visitor_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"visitor_id" uuid NOT NULL,
	"type" text NOT NULL,
	"path" text,
	"entity_type" text,
	"entity_id" uuid,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visitors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"visitor_key" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"lead_id" uuid,
	"first_touch" jsonb,
	"last_touch" jsonb,
	"consent" jsonb DEFAULT '{"analytics":false,"marketing":false,"at":null}'::jsonb NOT NULL,
	"device" text,
	"country" text
);
--> statement-breakpoint
ALTER TABLE "agent_availability_overrides" ADD CONSTRAINT "agent_availability_overrides_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_queue" ADD CONSTRAINT "approval_queue_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_merged_into_id_contacts_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_admin_id_users_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_id_lead_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."lead_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_merged_into_id_leads_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_requests" ADD CONSTRAINT "listing_requests_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_requests" ADD CONSTRAINT "listing_requests_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_requests" ADD CONSTRAINT "listing_requests_property_type_id_property_types_id_fk" FOREIGN KEY ("property_type_id") REFERENCES "public"."property_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_requests" ADD CONSTRAINT "listing_requests_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuation_requests" ADD CONSTRAINT "valuation_requests_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuation_requests" ADD CONSTRAINT "valuation_requests_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuation_requests" ADD CONSTRAINT "valuation_requests_property_type_id_property_types_id_fk" FOREIGN KEY ("property_type_id") REFERENCES "public"."property_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuation_requests" ADD CONSTRAINT "valuation_requests_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewings" ADD CONSTRAINT "viewings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewings" ADD CONSTRAINT "viewings_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewings" ADD CONSTRAINT "viewings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewings" ADD CONSTRAINT "viewings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewings" ADD CONSTRAINT "viewings_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_events" ADD CONSTRAINT "visitor_events_visitor_id_visitors_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_availability_unique" ON "agent_availability_overrides" USING btree ("agent_id","date");--> statement-breakpoint
CREATE INDEX "approval_queue_status_idx" ON "approval_queue" USING btree ("agency_id","status","created_at");--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "contacts" USING btree ("agency_id","email");--> statement-breakpoint
CREATE INDEX "contacts_phone_idx" ON "contacts" USING btree ("agency_id","phone");--> statement-breakpoint
CREATE INDEX "contacts_name_trgm" ON "contacts" USING gin (lintel_normalize("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "conversations_status_idx" ON "conversations" USING btree ("agency_id","status","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_external_idx" ON "conversations" USING btree ("agency_id","channel","external_id");--> statement-breakpoint
CREATE INDEX "conversations_lead_idx" ON "conversations" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_events_lead_idx" ON "lead_events" USING btree ("lead_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "lead_tasks_lead_idx" ON "lead_tasks" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_tasks_due_idx" ON "lead_tasks" USING btree ("agency_id","due_at");--> statement-breakpoint
CREATE INDEX "leads_status_stage_idx" ON "leads" USING btree ("agency_id","status","stage_id");--> statement-breakpoint
CREATE INDEX "leads_contact_idx" ON "leads" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "leads_agent_idx" ON "leads" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "leads_source_idx" ON "leads" USING btree ("agency_id","source","created_at");--> statement-breakpoint
CREATE INDEX "leads_response_due_idx" ON "leads" USING btree ("response_due_at");--> statement-breakpoint
CREATE INDEX "leads_next_task_idx" ON "leads" USING btree ("next_task_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_key_unique" ON "message_templates" USING btree ("agency_id","channel","key");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_external_idx" ON "messages" USING btree ("external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_subscribers_email_unique" ON "newsletter_subscribers" USING btree ("agency_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "shortlists_token_unique" ON "shortlists" USING btree ("token");--> statement-breakpoint
CREATE INDEX "shortlists_lead_idx" ON "shortlists" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "utm_links_code_unique" ON "utm_links" USING btree ("agency_id","short_code");--> statement-breakpoint
CREATE INDEX "viewings_agent_time_idx" ON "viewings" USING btree ("agent_id","starts_at");--> statement-breakpoint
CREATE INDEX "viewings_status_time_idx" ON "viewings" USING btree ("agency_id","status","starts_at");--> statement-breakpoint
CREATE INDEX "viewings_property_idx" ON "viewings" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "viewings_lead_idx" ON "viewings" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "visitor_events_visitor_idx" ON "visitor_events" USING btree ("visitor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "visitor_events_type_idx" ON "visitor_events" USING btree ("agency_id","type","created_at");--> statement-breakpoint
CREATE INDEX "visitor_events_entity_idx" ON "visitor_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "visitors_key_unique" ON "visitors" USING btree ("agency_id","visitor_key");--> statement-breakpoint
CREATE INDEX "visitors_lead_idx" ON "visitors" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "visitors_user_idx" ON "visitors" USING btree ("user_id");