import "../../scripts/_env";
import { parseArgs } from "node:util";
import { closeDb, getDb } from "../client";
import { havenDune } from "./presets/haven-dune";
import { seedPreset } from "./run";
import type { SeedPreset } from "./types";

/**
 * `pnpm db:seed [--preset=haven-dune] [--reset]` (16 §1). Prints the demo logins once.
 * --reset replaces the demo data (listings, projects, master data, files) in this database.
 */
const presets: Record<string, SeedPreset> = { "haven-dune": havenDune };

const { values } = parseArgs({
  options: {
    preset: { type: "string", default: "haven-dune" },
    reset: { type: "boolean", default: false },
  },
});

const preset = presets[values.preset!];
if (!preset) {
  console.error(`Unknown preset "${values.preset}". Presets: ${Object.keys(presets).join(", ")}`);
  process.exit(1);
}

try {
  const db = await getDb();
  const started = Date.now();
  const { admins, counts } = await seedPreset(db, preset, { reset: values.reset });
  console.log(`Seeded "${preset.key}" in ${Math.round((Date.now() - started) / 1000)} s:`);
  for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(16)} ${n}`);
  console.log("\nDemo logins (shown once; two-step verification is off for the demo):");
  for (const a of admins)
    console.log(
      `  ${a.email.padEnd(22)} ${a.password}${a.readOnly ? "   (read-only viewer)" : ""}`,
    );
} catch (err) {
  console.error("Seeding failed:", err);
  process.exitCode = 1;
} finally {
  await closeDb();
}
