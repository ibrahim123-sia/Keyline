import "./_env";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { startPgliteServer } from "./pglite";

/**
 * `pnpm db:start` — local database for development.
 *   --memory   keep everything in memory (nothing written to disk)
 *   --port N   override DB_DEV_PORT
 */
const args = process.argv.slice(2);
const memory = args.includes("--memory");
const portArg = args.indexOf("--port");
const port = Number(portArg >= 0 ? args[portArg + 1] : (process.env.DB_DEV_PORT ?? 5433));
const dataDir = resolve(process.env.DB_DEV_DATA_DIR ?? ".data/pglite");

if (!memory) mkdirSync(dataDir, { recursive: true });

const started = Date.now();
const { url, stop } = await startPgliteServer({ dataDir: memory ? undefined : dataDir, port });
console.log(`[db] PGlite ready in ${Date.now() - started} ms`);
console.log(`[db] ${memory ? "in-memory" : dataDir}`);
console.log(`[db] DATABASE_URL=${url}`);
console.log("[db] Press Ctrl+C to stop.");

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("\n[db] stopping...");
  await stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
