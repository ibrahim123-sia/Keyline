import "./scripts/_env";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5433/postgres",
  },
  // PostGIS owns spatial_ref_sys and friends; never diff or drop them.
  extensionsFilters: ["postgis"],
  strict: true,
  verbose: true,
});
