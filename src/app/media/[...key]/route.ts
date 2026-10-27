import { PUBLIC_KEY_RE } from "@/features/media/keys";
import { variantPrefix, variantQualities, variantWidths } from "@/features/media/queries";
import { isWorkersRuntime } from "@/lib/env";
import { formatFromName, isRaster } from "@/lib/images/inspect";
import { getImageTransformer, type OutputFormat } from "@/lib/images/transformer";
import { getStorage, type ObjectMeta, type StoredObject } from "@/lib/storage";

/**
 * Public files (07 §8). Keys are immutable, so responses are cached for a year. Uploaded
 * content never runs as a page here: nosniff, and a sandboxing CSP for anything opened directly.
 * `?w=&q=` returns a resized copy: Cloudflare Images on Workers (each size made once and kept
 * in R2), Next's own optimizer in development.
 */
const IMMUTABLE = "public, max-age=31536000, immutable";

function baseHeaders(key: string, meta: ObjectMeta): Headers {
  const h = new Headers({
    "Content-Type": meta.contentType,
    "Cache-Control": IMMUTABLE,
    ETag: meta.etag,
    "Last-Modified": meta.uploaded.toUTCString(),
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    "Cross-Origin-Resource-Policy": "same-site",
  });
  if (meta.contentType === "application/pdf") {
    const name = key.split("/").pop()!;
    h.set("Content-Disposition", `inline; filename="${name}"`);
  } else {
    h.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  }
  return h;
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "public, max-age=60", "Content-Type": "text/plain" },
  });
}

/** Single "bytes=a-b" ranges only (what PDF viewers and video players ask for). */
function parseRange(
  header: string | null,
  size: number,
): { offset: number; length: number } | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "invalid";
  if (m[1] === "") {
    const suffix = Math.min(Number(m[2]), size);
    return suffix > 0 ? { offset: size - suffix, length: suffix } : "invalid";
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || end < start) return "invalid";
  return { offset: start, length: end - start + 1 };
}

async function serve(request: Request, key: string, headOnly: boolean): Promise<Response> {
  const storage = await getStorage();
  const meta = await storage.head(key);
  if (!meta) return notFound();
  const headers = baseHeaders(key, meta);
  if (request.headers.get("if-none-match") === meta.etag) {
    return new Response(null, { status: 304, headers });
  }
  const range = parseRange(request.headers.get("range"), meta.size);
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${meta.size}`);
    return new Response(null, { status: 416, headers });
  }
  if (headOnly) {
    headers.set("Content-Length", String(meta.size));
    return new Response(null, { status: 200, headers });
  }
  const object: StoredObject | null = await storage.get(key, range ?? undefined);
  if (!object) return notFound();
  if (range && object.range) {
    headers.set(
      "Content-Range",
      `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${meta.size}`,
    );
    headers.set("Content-Length", String(object.range.length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(meta.size));
  return new Response(object.body, { status: 200, headers });
}

function pickFormat(accept: string, original: string): { format: OutputFormat; ext: string } {
  if (accept.includes("image/avif")) return { format: "image/avif", ext: "avif" };
  if (accept.includes("image/webp")) return { format: "image/webp", ext: "webp" };
  return original === "png" || original === "gif"
    ? { format: "image/png", ext: "png" }
    : { format: "image/jpeg", ext: "jpg" };
}

async function serveVariant(request: Request, key: string, width: number, quality: number) {
  const transformer = await getImageTransformer();
  if (!transformer) return serve(request, key, false); // no Cloudflare Images: the original
  const original = formatFromName(key)!;
  const { format, ext } = pickFormat(request.headers.get("accept") ?? "", original);
  const variantKey = `${variantPrefix(key)}${width}-${quality}.${ext}`;
  const storage = await getStorage();

  let object = await storage.get(variantKey);
  if (!object) {
    const source = await storage.getBytes(key);
    if (!source) return notFound();
    try {
      const resized = await transformer.resize(source, { width, quality, format });
      await storage.put(variantKey, resized, format);
      object = await storage.get(variantKey);
    } catch (err) {
      console.error("[media] resize failed", key, (err as Error).message);
      return serve(request, key, false);
    }
    if (!object) return notFound();
  }
  const headers = baseHeaders(key, object);
  headers.set("Vary", "Accept");
  headers.set("Content-Length", String(object.size));
  if (request.headers.get("if-none-match") === object.etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(object.body, { status: 200, headers });
}

async function handle(request: Request, params: Promise<{ key: string[] }>, headOnly: boolean) {
  const key = (await params).key.join("/");
  if (!PUBLIC_KEY_RE.test(key)) return notFound();
  const url = new URL(request.url);
  const w = url.searchParams.get("w");
  const q = url.searchParams.get("q");
  const format = formatFromName(key);
  if ((w || q) && !headOnly && format && isRaster(format)) {
    const width = Number(w);
    const quality = Number(q ?? 75);
    if (!variantWidths.includes(width) || !variantQualities.includes(quality)) {
      return new Response("Unsupported size", { status: 400 });
    }
    if (!isWorkersRuntime()) {
      // Development: Next's image optimizer (sharp) resizes, reading the original from here.
      const target = `/_next/image?url=${encodeURIComponent(url.pathname)}&w=${width}&q=${quality}`;
      return Response.redirect(new URL(target, url), 307);
    }
    return serveVariant(request, key, width, quality);
  }
  return serve(request, key, headOnly);
}

export async function GET(request: Request, ctx: RouteContext<"/media/[...key]">) {
  return handle(request, ctx.params, false);
}

export async function HEAD(request: Request, ctx: RouteContext<"/media/[...key]">) {
  return handle(request, ctx.params, true);
}
