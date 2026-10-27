import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { countBrochureDownload, downloadContext } from "@/features/brochure/count";
import { loadBrochure } from "@/features/brochure/data";
import { brochureTokenValid } from "@/features/brochure/links";
import { brochureFile } from "@/features/brochure/render";
import { brochureParamsSchema } from "@/features/brochure/schema";
import { loadSettings } from "@/features/settings/queries";
import { brochure as t } from "@/lib/i18n/dictionaries/brochure";
import { PdfUnavailableError } from "@/lib/pdf/render";
import { hit, rateLimitRules } from "@/lib/rate-limit";
import { clientIpFromHeaders, truncateIp } from "@/lib/request";

const text = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });

/**
 * Brochure download (11 §4): the uploaded PDF, else the generated one (made now when this
 * version is not stored yet). With the email gate on, only a signed link from the gate's
 * email works; anything else goes back to the page, where the form is. Counted per download.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/brochure/[kind]/[id]">,
): Promise<Response> {
  const parsed = brochureParamsSchema.safeParse(await ctx.params);
  if (!parsed.success) return text("Not found", 404);
  const { kind, id } = parsed.data;

  const db = await getDb();
  const ip = truncateIp(clientIpFromHeaders(request.headers)) ?? "unknown";
  const limit = await hit(`brochure:${ip}`, rateLimitRules.tool, db);
  if (!limit.allowed)
    return text(t.errors.tooMany, 429, {
      "Retry-After": String(Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000))),
    });

  const url = new URL(request.url);
  const { brochureEmailGate } = await loadSettings("leads", db);
  if (brochureEmailGate && !(await brochureTokenValid(url.searchParams.get("t"), kind, id))) {
    const loaded = await loadBrochure(db, kind, id);
    if (!loaded) return text(t.errors.gone, 404);
    const page = new URL(loaded.data.pageUrl);
    return Response.redirect(new URL(`${page.pathname}?brochure=1#brochure`, url), 303);
  }

  let file;
  try {
    file = await brochureFile(db, kind, id);
  } catch (err) {
    if (err instanceof PdfUnavailableError) {
      console.error("[brochure] rendering unavailable", err.cause);
      return text(t.errors.unavailable, 503, { "Retry-After": "120" });
    }
    throw err;
  }
  if (!file) return text(t.errors.gone, 404);

  const counting = downloadContext(request, await cookies());
  if (counting)
    await countBrochureDownload(db, {
      ...counting,
      kind,
      id,
      path: new URL(file.data.pageUrl).pathname,
      source: file.source,
    }).catch((err) => console.error("[brochure] count failed", err));

  return new Response(file.bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Content-Length": String(file.bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
