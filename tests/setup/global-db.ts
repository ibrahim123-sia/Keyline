import type { TestProject } from "vitest/node";
import { startTestDatabase } from "../../scripts/test-db";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/** Starts one in-memory database for the integration project and shares its URL. */
export default async function setup(project: TestProject) {
  const started = Date.now();
  const db = await startTestDatabase();
  console.log(`[test-db] ready on ${db.url} in ${Date.now() - started} ms`);
  project.provide("databaseUrl", db.url);
  return async () => {
    await db.stop();
  };
}
