"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  autoMapLeadColumns,
  checkLeadRow,
  leadImportFields,
  leadMappingProblems,
  type LeadImportContext,
  type LeadImportKey,
} from "@/features/leads/csv";
import { importLeadRows, type LeadImportResult } from "@/features/leads/import-actions";
import { CsvError, parseCsv } from "@/lib/csv";

const BATCH = 50;

/** CSV import of leads (09 §1 #20): map the columns, check every row, then import. */
export function LeadImport({
  context,
  readOnly,
}: {
  context: LeadImportContext;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [columns, setColumns] = useState<Array<LeadImportKey | null>>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<LeadImportResult[] | null>(null);

  const checks = useMemo(
    () => rows.map((cells) => checkLeadRow(cells, columns, context)),
    [rows, columns, context],
  );
  const problems = headers.length ? leadMappingProblems(columns) : [];
  const good = checks.filter((c) => c.row).length;

  async function onFile(file: File) {
    setResults(null);
    try {
      const table = parseCsv(await file.text());
      const [head, ...body] = table.filter((r) => r.some((c) => c.trim()));
      if (!head || body.length === 0)
        return toast.error("This file has no rows under its header line.");
      if (body.length > 5000) return toast.error("Import at most 5,000 rows at a time.");
      setFileName(file.name);
      setHeaders(head);
      setRows(body);
      setColumns(autoMapLeadColumns(head));
    } catch (err) {
      toast.error(err instanceof CsvError ? err.message : "Could not read this file as CSV.");
    }
  }

  async function run() {
    setBusy(true);
    const out: LeadImportResult[] = [];
    const lines = rows.map((cells, i) => ({ line: i + 2, cells })).filter((_, i) => checks[i]!.row);
    for (let i = 0; i < lines.length; i += BATCH) {
      const res = await importLeadRows({ columns, rows: lines.slice(i, i + BATCH), fileName });
      if (!res.ok) {
        toast.error(res.error);
        break;
      }
      out.push(...res.data);
    }
    setBusy(false);
    setResults(out);
    const created = out.filter((r) => r.ok && r.isNew).length;
    toast.success(`${created} new ${created === 1 ? "lead" : "leads"} imported`);
    router.refresh();
  }

  if (results) {
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r): r is Extract<LeadImportResult, { ok: false }> => !r.ok);
    return (
      <section
        aria-label="Import results"
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 text-[13.5px]"
      >
        <p className="font-semibold text-ink">
          {ok.filter((r) => r.isNew).length} new leads, {ok.filter((r) => !r.isNew).length} added to
          existing leads
          {failed.length ? `, ${failed.length} rows not imported` : ""}.
        </p>
        {failed.length > 0 && (
          <ul className="text-danger">
            {failed.slice(0, 20).map((f) => (
              <li key={f.line}>
                Line {f.line}: {f.errors.join("; ")}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/admin/leads?source=import">See the imported leads</Link>
          </Button>
          <Button variant="outline" onClick={() => (setResults(null), setHeaders([]), setRows([]))}>
            Import another file
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-5">
        <label htmlFor="lead-csv" className="text-[13px] font-semibold text-ink">
          CSV file
        </label>
        <input
          id="lead-csv"
          type="file"
          accept=".csv,text/csv"
          disabled={readOnly}
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          className="text-[13px]"
        />
        <p className="text-[12.5px] text-text-muted">
          One lead per row with a header line. Columns:{" "}
          {leadImportFields.map((f) => f.label).join(", ")}. Name and an email or phone are needed;
          budgets in your base currency.
        </p>
      </section>

      {headers.length > 0 && (
        <section
          aria-label="Columns"
          className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5"
        >
          <h2 className="text-[13px] font-semibold text-ink">Columns</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {headers.map((h, i) => (
              <label
                key={`${h}-${i}`}
                className="flex flex-col gap-1 text-[12.5px] text-text-muted"
              >
                {h || `Column ${i + 1}`}
                <select
                  aria-label={`Field for ${h || `column ${i + 1}`}`}
                  value={columns[i] ?? ""}
                  onChange={(e) =>
                    setColumns((c) =>
                      c.map((x, j) =>
                        j === i ? ((e.target.value || null) as LeadImportKey | null) : x,
                      ),
                    )
                  }
                  className="h-8 rounded-lg border border-input bg-surface px-2 text-[13px] text-ink"
                >
                  <option value="">Skip</option>
                  {leadImportFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {problems.map((p) => (
            <p key={p} role="alert" className="text-[12.5px] font-medium text-danger">
              {p}
            </p>
          ))}
        </section>
      )}

      {headers.length > 0 && problems.length === 0 && (
        <section
          aria-label="Preview"
          className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold text-ink">
              {good} of {rows.length} rows can be imported
            </h2>
            <Button disabled={readOnly || busy || good === 0} onClick={run}>
              Import {good} {good === 1 ? "lead" : "leads"}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-text-muted">
                  <th className="py-1 pe-3 font-semibold">Line</th>
                  <th className="py-1 pe-3 font-semibold">Name</th>
                  <th className="py-1 pe-3 font-semibold">Email / phone</th>
                  <th className="py-1 font-semibold">Check</th>
                </tr>
              </thead>
              <tbody>
                {checks.slice(0, 50).map((c, i) => (
                  <tr key={i} className="border-t border-border align-top">
                    <td className="py-1 pe-3 tabular">{i + 2}</td>
                    <td className="py-1 pe-3">
                      {c.row?.name ?? rows[i]?.[columns.indexOf("name")] ?? ""}
                    </td>
                    <td className="py-1 pe-3">
                      {[c.row?.email, c.row?.phone].filter(Boolean).join(" · ")}
                    </td>
                    <td
                      className={cn(
                        "py-1",
                        c.errors.length
                          ? "text-danger"
                          : c.warnings.length
                            ? "text-ink"
                            : "text-text-muted",
                      )}
                    >
                      {c.errors.length
                        ? c.errors.join("; ")
                        : c.warnings.length
                          ? c.warnings.join("; ")
                          : "Ready"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && (
              <p className="mt-2 text-[12px] text-text-muted">The first 50 rows are shown.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
