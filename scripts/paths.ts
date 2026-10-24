import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Local runtime data lives outside the project folder (in ~/.keyline). Inside the project,
 * every database write would wake Next's file watcher and reload the page in a loop.
 */
export const LOCAL_DATA_ROOT = process.env.KEYLINE_DATA_DIR ?? join(homedir(), ".keyline");

export function localDataPath(...parts: string[]): string {
  return resolve(LOCAL_DATA_ROOT, ...parts);
}
