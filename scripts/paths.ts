import { resolve } from "node:path";
import { localDataRoot } from "../lib/local-data";

/**
 * Local runtime data lives outside the project folder (in ~/.propel, see lib/local-data.ts).
 * Inside the project,
 * every database write would wake Next's file watcher and reload the page in a loop.
 */
export const LOCAL_DATA_ROOT = localDataRoot();

export function localDataPath(...parts: string[]): string {
  return resolve(LOCAL_DATA_ROOT, ...parts);
}
