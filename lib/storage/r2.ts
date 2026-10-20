import type { ObjectMeta, StorageDriver } from "./index";
import { assertKey, assertPrefix } from "./index";

/** The parts of the Workers R2 binding we use (types kept local, like the queue binding). */
type R2Object = {
  key: string;
  size: number;
  httpEtag: string;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
  range?: { offset?: number; length?: number };
};
type R2ObjectBody = R2Object & {
  body: ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
};
export type R2Bucket = {
  put(
    key: string,
    value: Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<R2Object | null>;
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2Object | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{
    objects: Array<{ key: string }>;
    truncated: boolean;
    cursor?: string;
  }>;
};

export async function mediaBucket(): Promise<R2Bucket> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  const bucket = (env as { MEDIA_BUCKET?: R2Bucket }).MEDIA_BUCKET;
  if (!bucket) throw new Error("The MEDIA_BUCKET R2 binding is missing (see wrangler.jsonc).");
  return bucket;
}

const metaOf = (o: R2Object): ObjectMeta => ({
  size: o.size,
  contentType: o.httpMetadata?.contentType ?? "application/octet-stream",
  etag: o.httpEtag,
  uploaded: o.uploaded,
});

export function r2Storage(bucket: R2Bucket): StorageDriver {
  return {
    name: "r2",
    async put(key, data, contentType) {
      assertKey(key);
      const o = await bucket.put(key, data, { httpMetadata: { contentType } });
      if (!o) throw new Error(`R2 refused the write for ${key}`);
      return metaOf(o);
    },
    async get(key, range) {
      assertKey(key);
      const o = await bucket.get(key, range ? { range } : undefined);
      if (!o) return null;
      return {
        ...metaOf(o),
        body: o.body,
        range: range
          ? { offset: o.range?.offset ?? range.offset, length: o.range?.length ?? range.length }
          : undefined,
      };
    },
    async getBytes(key) {
      assertKey(key);
      const o = await bucket.get(key);
      return o ? new Uint8Array(await o.arrayBuffer()) : null;
    },
    async head(key) {
      assertKey(key);
      const o = await bucket.head(key);
      return o ? metaOf(o) : null;
    },
    async delete(keys) {
      if (keys.length === 0) return;
      keys.forEach(assertKey);
      // R2 deletes up to 1000 keys per call.
      for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
    },
    async deletePrefix(prefix) {
      assertPrefix(prefix);
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix, cursor, limit: 1000 });
        if (page.objects.length) await bucket.delete(page.objects.map((o) => o.key));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
    },
  };
}
