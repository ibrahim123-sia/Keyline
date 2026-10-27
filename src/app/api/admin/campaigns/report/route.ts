import { getDb } from "@/db/client";
import { loadSettings } from "@/features/settings/queries";
import { campaignReport, defaultRange, reportParamsSchema } from "@/features/utm/report";
import { requireAdmin } from "@/lib/auth/guards";
import { toCsv } from "@/lib/csv";
import { localDateString } from "@/lib/local-date";
import { AuthError } from "@/lib/permissions";

/** Campaigns -> Report as CSV (09 §2): the same filters as the page. */
export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError)
      return new Response("Please sign in again, then export.", {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      });
    throw err;
  }
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const db = await getDb();
  const [general, market] = [await loadSettings("general", db), await loadSettings("market", db)];
  const parsed = reportParamsSchema.parse({
    dimension: sp.dimension,
    touch: sp.touch,
    from: sp.from ?? null,
    to: sp.to ?? null,
  });
  const range = defaultRange(localDateString(new Date(), general.timeZone));
  const params = { ...parsed, from: parsed.from ?? range.from, to: parsed.to ?? range.to };
  const { rows, total, currency } = await campaignReport(db, params);
  const major = (minor: number) => (minor / 10 ** market.baseCurrency.decimals).toFixed(2);
  const csv = toCsv(
    [
      [params.dimension, "Leads", "Viewings", "Won", `Deal value (${currency})`],
      ...[...rows, total].map((r) => [r.value, r.leads, r.viewings, r.won, major(r.dealValue)]),
    ],
    { bom: true },
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campaigns-${params.dimension}-${params.touch}-${params.from}-${params.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
