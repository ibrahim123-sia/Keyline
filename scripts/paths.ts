import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Local runtime data lives outside the project folder (in ~/.lintel). Inside the project,
 * every database write would wake Next's file watcher and reload the page in a loop.
 */
export const LOCAL_DATA_ROOT = process.env.LINTEL_DATA_DIR ?? join(homedir(), ".lintel");

export function localDataPath(...parts: string[]): string {
  return resolve(LOCAL_DATA_ROOT, ...parts);
}
