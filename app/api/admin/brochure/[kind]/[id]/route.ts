import { getDb } from "@/db/client";
import { brochureFile } from "@/features/brochure/render";
import { brochureParamsSchema } from "@/features/brochure/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { brochure as t } from "@/lib/i18n/dictionaries/brochure";
import { PdfUnavailableError } from "@/lib/pdf/render";
import { AuthError } from "@/lib/permissions";

const text = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

/**
 * "Generate brochure" in the admin (07 §2 quick actions, the editors): always the generated,
 * branded PDF (even when a brochure was uploaded), opened in the browser, never counted as a
 * download. Read-only, so the demo viewer may open it too. Only for live listings and
 * published projects: the brochure shows what the site shows.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/admin/brochure/[kind]/[id]">,
): Promise<Response> {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) return text(t.admin.signIn, 401);
    throw err;
  }
  const parsed = brochureParamsSchema.safeParse(await ctx.params);
  if (!parsed.success) return text("Not found", 404);
  const { kind, id } = parsed.data;
  let file;
  try {
    file = await brochureFile(await getDb(), kind, id, { preferGenerated: true });
  } catch (err) {
    if (err instanceof PdfUnavailableError) return text(t.errors.unavailable, 503);
    throw err;
  }
  if (!file) return text(kind === "property" ? t.admin.notLive : t.admin.notPublished, 409);
  return new Response(file.bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file.fileName}"`,
      "Content-Length": String(file.bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
