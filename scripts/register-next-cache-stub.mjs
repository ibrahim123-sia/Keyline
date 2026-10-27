/**
 * Lets offline tsx scripts (the AI eval) call public data loaders that use Cache Components.
 * Outside a Next server `cacheLife()` and `cacheTag()` throw, so `next/cache` becomes no-ops
 * here, as in the Vitest setup (tests/setup/next-mocks.ts). Never used by the app itself.
 * Use: tsx --import ./scripts/register-server-only.mjs --import ./scripts/register-next-cache-stub.mjs <script>
 */
import { register } from "node:module";

const stub = [
  "cacheLife",
  "cacheTag",
  "updateTag",
  "revalidateTag",
  "revalidatePath",
  "refresh",
  "unstable_noStore",
]
  .map((name) => `export function ${name}() {}`)
  .join("\n");

const hook = `export async function resolve(specifier, context, next) {
  if (specifier === "next/cache" || specifier === "next/cache.js")
    return { url: "data:text/javascript," + ${JSON.stringify(encodeURIComponent(stub))}, shortCircuit: true };
  return next(specifier, context);
}`;

register(`data:text/javascript,${encodeURIComponent(hook)}`);
