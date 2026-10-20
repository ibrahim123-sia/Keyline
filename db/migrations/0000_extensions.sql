-- Extensions used by Lintel (01-rules-and-stack.md: postgis, vector, pg_trgm, unaccent).
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
-- unaccent() is only STABLE, so it cannot be used in generated columns or index expressions.
-- This IMMUTABLE wrapper pins the dictionary, which makes it safe to index.
CREATE OR REPLACE FUNCTION lintel_unaccent(input text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, input) $$;
--> statement-breakpoint
-- Lowercased, unaccented text for typo-tolerant search (pg_trgm) and full-text.
CREATE OR REPLACE FUNCTION lintel_normalize(input text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT lower(lintel_unaccent(input)) $$;
