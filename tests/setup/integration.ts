import { afterAll, inject } from "vitest";
import { closeDb } from "@/db/client";

process.env.DATABASE_URL = inject("databaseUrl");
process.env.DB_POOL_MAX = "4";

afterAll(async () => {
  await closeDb();
});
