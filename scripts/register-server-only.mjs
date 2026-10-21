/**
 * Lets tsx scripts (seed, cron runner, admin setup) load modules marked `import "server-only"`.
 * Next.js and Vitest resolve that marker themselves; plain Node does not, so it becomes an
 * empty module here. Use: tsx --import ./scripts/register-server-only.mjs <script>
 */
import { register } from "node:module";

const hook = `export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  return next(specifier, context);
}`;

register(`data:text/javascript,${encodeURIComponent(hook)}`);
