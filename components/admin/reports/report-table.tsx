import Link from "next/link";
import { cn } from "cn";
import { formatValue } from "@/features/reports/format";
import type { ReportContext, ReportRow, ReportTable } from "@/features/reports/types";

/** A report table: real table markup with a caption, row headers and right-aligned numbers. */
export function ReportTableView({
  table,
  currency,
}: {
  table: ReportTable;
  currency: ReportContext["currency"];
}) {
  const cell = (r: ReportRow, key: string, fmt: ReportTable["columns"][number]["format"]) =>
    formatValue(r.cells[key] ?? null, r.formats?.[key] ?? fmt, currency);
  const [first, ...rest] = table.columns;
  return (
    <section className="flex flex-col gap-2" aria-labelledby={`table-${table.id}`}>
      <div>
        <h2 id={`table-${table.id}`} className="text-[14px] font-semibold text-ink">
          {table.title}
        </h2>
        {table.description && <p className="text-[12.5px] text-text-muted">{table.description}</p>}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-[13px]" data-report-table={table.id}>
          <caption className="sr-only">{table.title}</caption>
          <thead className="bg-muted text-start text-[12px] text-text-muted">
            <tr>
              {table.columns.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-3 py-2 font-semibold whitespace-nowrap",
                    i === 0 || c.format === "text" ? "text-start" : "text-end",
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {table.rows.length === 0 && (
              <tr>
                <td
                  colSpan={table.columns.length}
                  className="px-3 py-6 text-center text-text-muted"
                >
                  {table.empty}
                </td>
              </tr>
            )}
            {table.rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="px-3 py-2 text-start font-medium text-ink">
                  {r.href ? (
                    <Link href={r.href} className="hover:underline">
                      {cell(r, first!.key, first!.format)}
                    </Link>
                  ) : (
                    cell(r, first!.key, first!.format)
                  )}
                </th>
                {rest.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 py-2 tabular-nums",
                      c.format === "text" ? "text-start" : "text-end whitespace-nowrap",
                    )}
                  >
                    {cell(r, c.key, c.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {table.total && table.rows.length > 0 && (
            <tfoot className="border-t border-border font-semibold">
              <tr>
                <th scope="row" className="px-3 py-2 text-start">
                  {cell(table.total, first!.key, first!.format)}
                </th>
                {rest.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 py-2 tabular-nums",
                      c.format === "text" ? "text-start" : "text-end whitespace-nowrap",
                    )}
                  >
                    {cell(table.total!, c.key, c.format)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
