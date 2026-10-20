import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { startPgliteServer } from "./pglite";

/**
 * In-memory test database (PGlite) with all migrations applied.
 * Creating PostGIS from scratch takes ~20 s, so a migrated snapshot is cached in
 * `.data/` and reused until a migration file changes.
 */

const MIGRATIONS_DIR = resolve("db/migrations");
const CACHE_DIR = resolve(".data");

function migrationsHash(): string {
  const h = createHash("sha256");
  const walk = (dir: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = join(dir, name.name);
      if (name.isDirectory()) walk(full);
      else {
        h.update(name.name);
        h.update(readFileSync(full));
      }
    }
  };
  walk(MIGRATIONS_DIR);
  return h.digest("hex").slice(0, 16);
}

export type TestDatabase = { url: string; port: number; stop: () => Promise<void> };

export async function startTestDatabase(options: { port?: number } = {}): Promise<TestDatabase> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const hash = migrationsHash();
  const snapshot = join(CACHE_DIR, `test-db-${hash}.tar.gz`);

  if (existsSync(snapshot)) {
    const blob = new Blob([readFileSync(snapshot)]);
    const server = await startPgliteServer({ loadDataDir: blob, port: options.port ?? 0 });
    return { url: server.url, port: server.port, stop: server.stop };
  }

  const server = await startPgliteServer({ port: options.port ?? 0 });
  const pool = new Pool({ connectionString: server.url, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await pool.end();
  }
  const dump = await server.db.dumpDataDir("gzip");
  // Remove snapshots of older migration sets, then store the new one.
  for (const name of readdirSync(CACHE_DIR)) {
    if (name.startsWith("test-db-") && name.endsWith(".tar.gz")) unlinkSync(join(CACHE_DIR, name));
  }
  writeFileSync(snapshot, Buffer.from(await dump.arrayBuffer()));
  return { url: server.url, port: server.port, stop: server.stop };
}
