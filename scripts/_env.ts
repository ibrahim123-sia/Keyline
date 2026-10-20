/**
 * Loads `.env.local` then `.env` for scripts run with tsx (Next.js does this itself for the app).
 * Values already in process.env win, so CI can override anything.
 */
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch (err) {
      console.warn(`[env] could not load ${file}:`, (err as Error).message);
    }
  }
}
