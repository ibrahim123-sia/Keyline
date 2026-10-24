import { getStorage } from "@/lib/storage";
import { reportIdFromToken, reportKey } from "@/features/tools/roi-report";

const notFound = () =>
  new Response("This link has expired or is not valid. Make a new report on the site.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

/**
 * The emailed rental return report (11 §2): a signed link (30 days) to a PDF in private
 * storage. Personal numbers, so never cached and never indexed.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/tools/roi-report/[token]">) {
  const { token } = await ctx.params;
  const reportId = await reportIdFromToken(token);
  if (!reportId) return notFound();
  const object = await (await getStorage()).get(reportKey(reportId));
  if (!object) return notFound();
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(object.size),
      "Content-Disposition": 'attachment; filename="rental-return-report.pdf"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
