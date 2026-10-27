import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readEnv } from "./legacy-env";

/**
 * Where local development data lives (the PGlite database, uploaded media): ~/.propel, or
 * PROPEL_DATA_DIR. A machine set up before the rename (2026-10-27) has it in ~/.keyline;
 * that folder keeps being used until ~/.propel exists, so nobody loses their local data.
 * Move it with: mv ~/.keyline ~/.propel
 */
export function localDataRoot(): string {
  const configured = readEnv("PROPEL_DATA_DIR");
  if (configured) return configured;
  const current = join(homedir(), ".propel");
  const legacy = join(homedir(), ".keyline");
  return !existsSync(current) && existsSync(legacy) ? legacy : current;
}
