import "./_env";
import { Client } from "pg";
import { runMigrations } from "../src/db/migrate";
import { closeDb } from "../src/db/client";
import { readEnv } from "../src/lib/legacy-env";

/**
 * `pnpm db:reset --yes` — drops every table (schemas `public` and `drizzle`) and re-applies
 * all migrations. Refuses to run against production.
 */
if (readEnv("PROPEL_ENV") === "production") {
  console.error("[db] refusing to reset a production database");
  process.exit(1);
}
if (!process.argv.includes("--yes")) {
  console.error("[db] this deletes all data. Re-run with --yes to confirm.");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[db] DATABASE_URL is not set");
  process.exit(1);
}

const client = new Client({ connectionString: url });
await client.connect();
try {
  await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await client.query("DROP SCHEMA IF EXISTS public CASCADE");
  await client.query("CREATE SCHEMA public");
  await client.query("GRANT ALL ON SCHEMA public TO public");
} finally {
  await client.end();
}
console.log("[db] schemas dropped, applying migrations...");
await runMigrations();
await closeDb();
console.log("[db] reset complete");
