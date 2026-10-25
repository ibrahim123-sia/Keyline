CREATE TABLE "ai_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"admin_id" uuid,
	"conversation_ref" text,
	"tool" text NOT NULL,
	"input" jsonb NOT NULL,
	"preview" jsonb NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"result" jsonb,
	"error" text,
	"decided_by" uuid,
	"confirmed_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"source" text DEFAULT 'admin_chat' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"date" date NOT NULL,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_read_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_write_tokens" bigint DEFAULT 0 NOT NULL,
	"cost_estimate_micros" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agency_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"content_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, lintel_normalize(content))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_actions_status_idx" ON "ai_actions" USING btree ("agency_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_actions_conversation_idx" ON "ai_actions" USING btree ("conversation_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_day_feature_model_unique" ON "ai_usage" USING btree ("agency_id","date","feature","model");--> statement-breakpoint
CREATE UNIQUE INDEX "embeddings_entity_chunk_unique" ON "embeddings" USING btree ("agency_id","entity_type","entity_id","chunk_index");--> statement-breakpoint
CREATE INDEX "embeddings_entity_idx" ON "embeddings" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "embeddings_vector_idx" ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "embeddings_content_fts_idx" ON "embeddings" USING gin ("content_vector");