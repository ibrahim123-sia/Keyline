import "server-only";
import { cacheLife } from "next/cache";

/** This year, for copyright lines (cached: the static shell must not read the clock). */
export async function currentYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}
