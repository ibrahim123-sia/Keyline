import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { cache } from "react";
import * as schema from "./schema";
import { isWorkersRuntime } from "@/lib/env";

export type Db = NodePgDatabase<typeof schema>;
/** A Drizzle transaction handle (same query API as Db). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export const DB_CASING = "snake_case" as const;

declare global {
  var __keylinePool: Pool | undefined;
  var __keylineDb: Db | undefined;
}

function createDb(pool: Pool): Db {
  return drizzle({ client: pool, schema, casing: DB_CASING });
}

/**
 * Node (dev server, scripts, tests): one shared pool for the process.
 * Kept on globalThis so hot reloads do not open a new pool each time.
 */
function nodeDb(): Db {
  if (globalThis.__keylineDb) return globalThis.__keylineDb;
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error("DATABASE_URL is not set. Start the local database with `pnpm db:start`.");
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
  });
  pool.on("error", (err) => console.error("[db] idle client error", err.message));
  globalThis.__keylinePool = pool;
  globalThis.__keylineDb = createDb(pool);
  return globalThis.__keylineDb;
}

/**
 * Cloudflare Workers: I/O objects cannot be shared between requests, so each request gets
 * its own small pool through Hyperdrive (which does the real pooling at the edge).
 * React `cache` dedupes it within one server render.
 */
const workersDb = cache(async (): Promise<Db> => {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  const hyperdrive = (env as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE;
  if (!hyperdrive) throw new Error("HYPERDRIVE binding is missing");
  const pool = new Pool({ connectionString: hyperdrive.connectionString, max: 3, maxUses: 1 });
  return createDb(pool);
});

export async function getDb(): Promise<Db> {
  return isWorkersRuntime() ? workersDb() : nodeDb();
}

/** Close the Node pool (scripts and tests). */
export async function closeDb(): Promise<void> {
  const pool = globalThis.__keylinePool;
  globalThis.__keylinePool = undefined;
  globalThis.__keylineDb = undefined;
  if (pool) await pool.end();
}

export { schema };
