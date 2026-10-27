import { z } from "zod";
import { getDb } from "@/db/client";
import { loadEmailBrand } from "@/emails/brand";
import { buildReport, isReportKey } from "@/features/reports/build";
import { reportCsv, reportHtml } from "@/features/reports/export";
import { requireAdmin } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import { reports as t } from "@/lib/i18n/dictionaries/reports";
import { PdfUnavailableError, renderPdf } from "@/lib/pdf/render";
import { AuthError } from "@/lib/permissions";

const formatSchema = z.enum(["csv", "pdf"]);

const plain = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

/**
 * Admin -> Reports export (09 §7): `?format=csv|pdf` plus the report's own URL params (period,
 * dimension, thresholds). Admins only; every export is written to the audit log.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/admin/reports/[report]">,
): Promise<Response> {
  let actor;
  try {
    actor = (await requireAdmin()).actor;
  } catch (err) {
    if (err instanceof AuthError) return plain(t.export.signIn, 401);
    throw err;
  }
  const { report } = await ctx.params;
  if (!isReportKey(report)) return plain("Unknown report.", 404);
  const url = new URL(request.url);
  const fmt = formatSchema.safeParse(url.searchParams.get("format") ?? "csv");
  if (!fmt.success) return plain("Choose csv or pdf.", 400);
  const sp = Object.fromEntries(url.searchParams);
  const db = await getDb();
  const built = await buildReport(db, report, sp, { full: true });
  const { data, query } = built;
  const name = `report-${report}-${data.period.from}-${data.period.to}`;

  let body: BodyInit;
  let type: string;
  if (fmt.data === "csv") {
    body = reportCsv(data, built.ctx);
    type = "text/csv; charset=utf-8";
  } else {
    const brand = await loadEmailBrand(db);
    try {
      const pdf = await renderPdf(reportHtml(data, built.ctx, brand));
      body = new Blob([pdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
    } catch (err) {
      if (err instanceof PdfUnavailableError) return plain(t.export.pdfUnavailable, 503);
      throw err;
    }
    type = "application/pdf";
  }
  await writeAudit(db, {
    actor,
    action: "report.export",
    entityType: "report",
    entityId: null,
    after: { report, format: fmt.data, from: data.period.from, to: data.period.to, ...query },
  });
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${name}.${fmt.data}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
