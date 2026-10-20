import { startTestDatabase } from "./test-db";

/**
 * `tsx scripts/test-db-server.ts [port]` — a throwaway, fully migrated in-memory database
 * that keeps running (CI uses it for the Workers build, which prerenders against a database).
 */
const port = Number(process.argv[2] ?? 5433);
const db = await startTestDatabase({ port });
console.log(`[test-db] ready: ${db.url}`);
const stop = async () => {
  await db.stop();
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
