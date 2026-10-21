import { getDb } from "@/db/client";
import { exportLeadsCsv } from "@/features/leads/export";
import { leadSortable } from "@/features/leads/filters";
import { leadIdsFor } from "@/features/leads/list";
import { requireAdmin } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/audit";
import { AuthError } from "@/lib/permissions";
import { parseTableParams } from "@/lib/table-params";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * CSV export of the lead list (09 §4): the list's filters from the query string, or `ids=`
 * for selected rows. Logged in the audit (it holds personal data).
 */
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
  const url = new URL(request.url);
  const db = await getDb();
  const selected = url.searchParams.get("ids");
  const ids = selected
    ? [...new Set(selected.split(",").filter((id) => UUID.test(id)))].slice(0, 1000)
    : await leadIdsFor(
        parseTableParams(Object.fromEntries(url.searchParams), {
          sortable: leadSortable,
          defaultSort: { id: "created", desc: true },
        }),
        db,
      );
  const { csv, count } = await exportLeadsCsv(db, ids);
  const filters = Object.fromEntries([...url.searchParams].filter(([k]) => k !== "ids"));
  await writeAudit(db, {
    actor,
    action: "lead.export",
    entityType: "lead",
    entityId: null,
    after: { count, ...(selected ? { selected: ids.length } : { filters }) },
  });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${day}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
