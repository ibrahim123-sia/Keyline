import { getDb } from "@/db/client";
import { parseStatus, subscribersForExport } from "@/features/newsletter/queries";
import { requireAdmin } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { AuthError } from "@/lib/permissions";

/** Campaigns -> Newsletter as CSV. Logged in the audit (it holds personal data). */
export async function GET(request: Request): Promise<Response> {
  let actor;
  try {
    actor = (await requireAdmin()).actor;
  } catch (err) {
    if (err instanceof AuthError)
      return new Response("Please sign in again, then export.", {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      });
    throw err;
  }
  const sp = new URL(request.url).searchParams;
  const filter = {
    q: (sp.get("q") ?? "").trim().slice(0, 100),
    status: parseStatus(sp.get("status")),
  };
  const db = await getDb();
  const rows = await subscribersForExport(db, filter);
  await writeAudit(db, {
    actor,
    action: "newsletter.export",
    entityType: "newsletter_subscriber",
    entityId: null,
    after: { count: rows.length, ...filter },
  });
  const iso = (d: Date | null) => (d ? d.toISOString() : "");
  const csv = toCsv(
    [
      ["Email", "Status", "Signed up from", "Signed up", "Confirmed", "Unsubscribed"],
      ...rows.map((r) => [
        r.email,
        r.status,
        r.source ?? "",
        iso(r.createdAt),
        iso(r.confirmedAt),
        iso(r.unsubscribedAt),
      ]),
    ],
    { bom: true },
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="newsletter-subscribers.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
