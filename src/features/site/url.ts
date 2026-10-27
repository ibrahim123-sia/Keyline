import "server-only";
import { env } from "@/lib/env";

/** The public site's address (APP_URL), without a trailing slash. */
export function siteOrigin(): string {
  return env().APP_URL.replace(/\/$/, "");
}

/** An absolute link to a path on the site (share messages, structured data). */
export function siteUrl(path = "/"): string {
  return new URL(path, `${siteOrigin()}/`).toString();
}
