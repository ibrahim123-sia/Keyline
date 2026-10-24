import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { mimeFromName } from "@/lib/images/inspect";
import { assertKey, assertPrefix, type ObjectMeta, type StorageDriver } from "./index";

/**
 * Local disk driver for development and the e2e server. Files live outside the project
 * (default ~/.keyline/media) so the dev server's file watcher never sees them. The content
 * type comes from the extension: every public key has one, staging keys are never served.
 */
export function fsStorage(root = path.join(homedir(), ".keyline", "media")): StorageDriver {
  const file = (key: string) => {
    assertKey(key);
    return path.join(root, ...key.split("/"));
  };
  const meta = (key: string, size: number, mtime: Date): ObjectMeta => ({
    size,
    contentType: mimeFromName(key),
    etag: `"${size.toString(16)}-${Math.floor(mtime.getTime()).toString(16)}"`,
    uploaded: mtime,
  });
  const headOf = async (key: string) => {
    try {
      const s = await stat(file(key));
      return s.isFile() ? meta(key, s.size, s.mtime) : null;
    } catch {
      return null;
    }
  };

  return {
    name: "fs",
    async put(key, data, _contentType) {
      const target = file(key);
      await mkdir(path.dirname(target), { recursive: true });
      // Write then rename, so a reader never sees half a file.
      const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, data);
      await rename(tmp, target);
      return (await headOf(key))!;
    },
    async get(key, range) {
      const m = await headOf(key);
      if (!m) return null;
      if (range) {
        const length = Math.max(0, Math.min(range.length, m.size - range.offset));
        const handle = await open(file(key), "r");
        try {
          const buf = new Uint8Array(length);
          await handle.read(buf, 0, length, range.offset);
          return {
            ...m,
            range: { offset: range.offset, length },
            body: new Blob([buf]).stream() as ReadableStream<Uint8Array>,
          };
        } finally {
          await handle.close();
        }
      }
      const body = Readable.toWeb(createReadStream(file(key))) as ReadableStream<Uint8Array>;
      return { ...m, body };
    },
    async getBytes(key) {
      try {
        return new Uint8Array(await readFile(file(key)));
      } catch {
        return null;
      }
    },
    head: headOf,
    async delete(keys) {
      await Promise.all(keys.map((k) => rm(file(k), { force: true })));
    },
    async deletePrefix(prefix) {
      assertPrefix(prefix);
      await rm(path.join(root, ...prefix.slice(0, -1).split("/")), {
        recursive: true,
        force: true,
      });
    },
  };
}
