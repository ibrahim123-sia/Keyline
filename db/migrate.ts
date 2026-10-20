import "../scripts/_env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "./client";

/** `pnpm db:migrate` — applies db/migrations in order. Safe to run repeatedly. */
export async function runMigrations(): Promise<void> {
  const db = await getDb();
  await migrate(db, { migrationsFolder: "db/migrations" });
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("db/migrate.ts");
if (isMain) {
  const started = Date.now();
  runMigrations()
    .then(() => console.log(`[db] migrations applied in ${Date.now() - started} ms`))
    .catch((err) => {
      console.error("[db] migration failed:", err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
