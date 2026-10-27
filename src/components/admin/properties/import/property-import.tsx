"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileUpIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { cn } from "cn";
import { FormSection } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import {
  autoMap,
  checkRow,
  csvFields,
  mappingProblems,
  templateFields,
  type FieldKey,
  type ImportContext,
  type ImportRowResult,
  type RowCheck,
} from "@/features/properties/csv";
import { importPropertyRows } from "@/features/properties/import-actions";
import { CsvError, parseCsv, toCsv } from "@/lib/csv";
import { formatAmount } from "@/lib/money";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;
const BATCH_ROWS = 50;
/** Server Actions accept 1 MB; long descriptions make some rows heavy. */
const BATCH_CHARS = 600_000;
const SHOWN_ROWS = 200;

type Sheet = {
  fileName: string;
  headers: string[];
  rows: Array<{ line: number; cells: string[] }>;
};
type Step = "upload" | "map" | "preview" | "importing" | "done";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Admin -> Properties -> Import (07 §7): template, upload, columns, preview, drafts. */
export function PropertyImport({
  context,
  readOnly,
}: {
  context: ImportContext;
  readOnly?: boolean;
}) {
  const fileInputId = useId();
  const [step, setStep] = useState<Step>("upload");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [columns, setColumns] = useState<Array<FieldKey | null>>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [results, setResults] = useState<ImportRowResult[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [importError, setImportError] = useState<string | null>(null);

  const fields = templateFields(context.areaUnit);

  function downloadTemplate() {
    const example: Partial<Record<FieldKey, string>> = {
      property_type: context.types[0]?.name ?? "Apartment",
      location: context.locations[0]?.name ?? "",
      currency: context.baseCurrency,
      size_sqm: "111",
      size_sqft: "1200",
    };
    download(
      "properties-template.csv",
      toCsv([fields.map((x) => x.key), fields.map((x) => example[x.key] ?? x.example)], {
        bom: true,
      }),
    );
  }

  async function readFile(file: File) {
    setReadError(null);
    if (file.size > MAX_BYTES) {
      setReadError("This file is larger than 5 MB. Split it into smaller files.");
      return;
    }
    let parsed: string[][];
    try {
      parsed = parseCsv(await file.text());
    } catch (err) {
      setReadError(err instanceof CsvError ? err.message : "This file could not be read as CSV.");
      return;
    }
    const [headers, ...data] = parsed;
    const rows = data
      .map((cells, i) => ({ line: i + 2, cells }))
      .filter((r) => r.cells.some((c) => c.trim()));
    if (!headers || rows.length === 0) {
      setReadError("The file needs a header row and at least one listing.");
      return;
    }
    if (rows.length > MAX_ROWS) {
      setReadError(`This file has ${rows.length} listings. Import at most ${MAX_ROWS} at a time.`);
      return;
    }
    setSheet({ fileName: file.name, headers, rows });
    setColumns(autoMap(headers, context.areaUnit));
    setStep("map");
  }

  const checks = useMemo<RowCheck[]>(
    () =>
      step === "preview" || step === "importing" || step === "done"
        ? (sheet?.rows ?? []).map((r) => checkRow(r.cells, columns, context))
        : [],
    [step, sheet, columns, context],
  );
  const ready = checks.filter((c) => c.draft).length;
  const problems = mappingProblems(columns);

  async function runImport() {
    if (!sheet) return;
    const used = columns.flatMap((k, i) => (k ? [i] : []));
    const valid = sheet.rows
      .filter((_, i) => checks[i]?.draft)
      .map((r) => ({ line: r.line, cells: used.map((i) => r.cells[i] ?? "") }));
    const batches: (typeof valid)[] = [];
    let current: typeof valid = [];
    let size = 0;
    for (const row of valid) {
      const chars = row.cells.reduce((n, c) => n + c.length + 8, 16);
      if (current.length > 0 && (current.length >= BATCH_ROWS || size + chars > BATCH_CHARS)) {
        batches.push(current);
        current = [];
        size = 0;
      }
      current.push(row);
      size += chars;
    }
    if (current.length) batches.push(current);

    setStep("importing");
    setImportError(null);
    setProgress({ done: 0, total: valid.length });
    const all: ImportRowResult[] = [];
    for (const batch of batches) {
      let res;
      try {
        res = await importPropertyRows({ columns: used.map((i) => columns[i]!), rows: batch });
      } catch {
        res = { ok: false as const, error: "Could not reach the server." };
      }
      if (!res.ok) {
        setImportError(
          `${res.error} ${all.filter((r) => r.ok).length} drafts were created before this stopped.`,
        );
        break;
      }
      all.push(...res.data.results);
      setProgress({ done: all.length, total: valid.length });
    }
    setResults(all);
    setStep("done");
  }

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex flex-wrap gap-2 text-[12.5px]" aria-label="Import steps">
        {(
          [
            ["upload", "1. File"],
            ["map", "2. Columns"],
            ["preview", "3. Check"],
            ["done", "4. Drafts"],
          ] as const
        ).map(([key, label]) => {
          const order: Step[] = ["upload", "map", "preview", "importing", "done"];
          const current = order.indexOf(step) >= order.indexOf(key);
          return (
            <li
              key={key}
              aria-current={
                step === key || (key === "done" && step === "importing") ? "step" : undefined
              }
              className={cn(
                "rounded-full border px-3 py-1 font-medium",
                current ? "border-accent bg-accent-soft text-ink" : "border-border text-text-muted",
              )}
            >
              {label}
            </li>
          );
        })}
      </ol>

      {step === "upload" && (
        <>
          <FormSection
            title="Start from the template"
            description={`Each row is one listing. Sizes are in ${context.areaUnit === "sqft" ? "square feet" : "square metres"} and prices in ${context.baseCurrency} unless a row says otherwise.`}
          >
            <div>
              <Button type="button" variant="outline" onClick={downloadTemplate}>
                <DownloadIcon /> Download template
              </Button>
            </div>
            <details className="text-[13px] text-text-muted">
              <summary className="cursor-pointer font-medium text-ink">
                What each column means
              </summary>
              <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {fields.map((x) => (
                  <div key={x.key} className="flex gap-2">
                    <dt className="shrink-0 font-mono text-[12px] text-ink">{x.key}</dt>
                    <dd>
                      {x.label}
                      {x.required ? " (required)" : ""}
                      {x.hint ? `: ${x.hint}` : ""}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          </FormSection>
          <FormSection
            title="Upload your file"
            description="A CSV file saved from Excel, Google Sheets or Numbers, up to 2,000 listings."
          >
            <label
              htmlFor={fileInputId}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-surface-soft px-4 py-8 text-center text-[13px] text-text-muted focus-within:ring-2 hover:border-ink/30"
            >
              <FileUpIcon className="size-6 text-ink" aria-hidden />
              <span className="font-semibold text-ink">Choose a CSV file</span>
              <span>Nothing is saved until you confirm the import.</span>
              <input
                id={fileInputId}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void readFile(file);
                  e.target.value = "";
                }}
              />
            </label>
            {readError && (
              <p role="alert" className="text-[13px] font-medium text-danger">
                {readError}
              </p>
            )}
          </FormSection>
        </>
      )}

      {step === "map" && sheet && (
        <FormSection
          title="Match the columns"
          description={`${sheet.fileName}: ${sheet.rows.length} ${sheet.rows.length === 1 ? "listing" : "listings"}. Columns with a known name are matched already; check the rest.`}
        >
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-start text-[13px]">
              <thead className="border-b border-border bg-surface-soft text-[12px] text-text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-semibold">
                    Column in your file
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-semibold">
                    Example
                  </th>
                  <th scope="col" className="px-3 py-2 text-start font-semibold">
                    Import as
                  </th>
                </tr>
              </thead>
              <tbody>
                {sheet.headers.map((header, i) => {
                  const sample = sheet.rows
                    .slice(0, 20)
                    .map((r) => r.cells[i]?.trim())
                    .find(Boolean);
                  return (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 font-medium text-ink">
                        {header || `Column ${i + 1}`}
                      </td>
                      <td className="max-w-56 truncate px-3 py-2 text-text-muted" title={sample}>
                        {sample ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          aria-label={`Import “${header || `Column ${i + 1}`}” as`}
                          value={columns[i] ?? ""}
                          onChange={(e) =>
                            setColumns((cols) =>
                              cols.map((c, j) =>
                                j === i ? ((e.target.value || null) as FieldKey | null) : c,
                              ),
                            )
                          }
                          className="h-8 w-full min-w-48 rounded-lg border border-input bg-surface px-2 text-[13px] text-ink"
                        >
                          <option value="">Don’t import</option>
                          {csvFields
                            .filter((x) => x.importable)
                            .map((x) => (
                              <option key={x.key} value={x.key}>
                                {x.label}
                                {x.required ? " (required)" : ""}
                              </option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {problems.length > 0 && (
            <ul role="alert" className="flex flex-col gap-1 text-[13px] font-medium text-danger">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("upload")}>
              Choose another file
            </Button>
            <Button type="button" disabled={problems.length > 0} onClick={() => setStep("preview")}>
              Check the rows
            </Button>
          </div>
        </FormSection>
      )}

      {step === "preview" && sheet && (
        <FormSection
          title="Check before importing"
          description="Rows with problems are left out; fix them in your file and import them later."
        >
          <p className="text-[13.5px] text-ink">
            <strong>{ready}</strong> {ready === 1 ? "row is" : "rows are"} ready to import
            {sheet.rows.length - ready > 0 && (
              <>
                {" · "}
                <strong className="text-danger">{sheet.rows.length - ready}</strong> with problems
              </>
            )}
            .
          </p>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-accent)]"
              checked={onlyProblems}
              onChange={(e) => setOnlyProblems(e.target.checked)}
            />
            Only show rows with problems
          </label>
          <PreviewTable
            sheet={sheet}
            checks={checks}
            context={context}
            onlyProblems={onlyProblems}
            titleColumn={columns.indexOf("title")}
          />
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("map")}>
              Back to the columns
            </Button>
            <Button
              type="button"
              disabled={ready === 0 || readOnly}
              onClick={() => void runImport()}
            >
              Import {ready} {ready === 1 ? "draft" : "drafts"}
            </Button>
          </div>
        </FormSection>
      )}

      {step === "importing" && (
        <FormSection title="Importing">
          <p role="status" className="text-[13.5px] text-ink">
            {progress.done} of {progress.total} listings imported…
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
        </FormSection>
      )}

      {step === "done" && (
        <ImportDone
          results={results}
          error={importError}
          onAgain={() => {
            setSheet(null);
            setColumns([]);
            setResults([]);
            setStep("upload");
          }}
        />
      )}
    </div>
  );
}

function PreviewTable({
  sheet,
  checks,
  context,
  onlyProblems,
  titleColumn,
}: {
  sheet: Sheet;
  checks: RowCheck[];
  context: ImportContext;
  onlyProblems: boolean;
  /** Where the title is in the file, to name rows that have problems. */
  titleColumn: number;
}) {
  const typeName = new Map(context.types.map((t) => [t.id, t.name]));
  const locationName = new Map(context.locations.map((l) => [l.id, l.name]));
  const rows = sheet.rows
    .map((r, i) => ({ ...r, check: checks[i]! }))
    .filter((r) => r.check && (!onlyProblems || !r.check.draft));
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-start text-[13px]">
          <caption className="sr-only">Rows in the file</caption>
          <thead className="border-b border-border bg-surface-soft text-[12px] text-text-muted">
            <tr>
              {["Line", "Title", "Type", "Location", "Price", "Result"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 text-start font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, SHOWN_ROWS).map(({ line, cells, check }) => {
              const d = check.draft;
              const title = d ? d.title : titleColumn >= 0 ? cells[titleColumn]?.trim() : "";
              return (
                <tr key={line} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-2 text-text-muted tabular">{line}</td>
                  <td className="px-3 py-2 text-ink">{title || "—"}</td>
                  <td className="px-3 py-2">{d ? typeName.get(d.propertyTypeId) : "—"}</td>
                  <td className="px-3 py-2">
                    {d?.locationId ? locationName.get(d.locationId) : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular">
                    {d?.price != null
                      ? `${d.currency} ${formatAmount(d.price, context.currencies[d.currency] ?? 2)}`
                      : d?.priceOnRequest
                        ? "On request"
                        : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {d ? (
                      <span className="inline-flex items-center gap-1 font-medium text-success">
                        <CheckCircle2Icon className="size-4" aria-hidden /> Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-start gap-1 font-medium text-danger">
                        <XCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <span>
                          <span className="sr-only">Problem: </span>
                          {check.errors.join(" ")}
                        </span>
                      </span>
                    )}
                    {check.warnings.length > 0 && (
                      <span className="mt-1 flex items-start gap-1 text-[12.5px] text-accent">
                        <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        {check.warnings.join(" ")}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > SHOWN_ROWS && (
        <p className="text-[12.5px] text-text-muted">
          Showing the first {SHOWN_ROWS} of {rows.length} rows.
        </p>
      )}
    </div>
  );
}

function ImportDone({
  results,
  error,
  onAgain,
}: {
  results: ImportRowResult[];
  error: string | null;
  onAgain: () => void;
}) {
  const created = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const photos = created.reduce((n, r) => n + r.photos, 0);
  return (
    <FormSection title="Import finished">
      <div role="status" className="flex flex-col gap-1 text-[13.5px] text-ink">
        <p>
          <strong>{created.length}</strong> {created.length === 1 ? "draft" : "drafts"} created.
        </p>
        {failed.length > 0 && (
          <p className="text-danger">
            {failed.length} {failed.length === 1 ? "row was" : "rows were"} not imported.
          </p>
        )}
        {photos > 0 && (
          <p className="text-text-muted">
            {photos} {photos === 1 ? "photo is" : "photos are"} downloading in the background. Any
            that fail are listed on the System page.
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
      {created.length > 0 && (
        <ul className="flex flex-col gap-1 text-[13px]" aria-label="New drafts">
          {created.slice(0, 50).map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/properties/${r.id}`}
                className="text-ink underline-offset-2 hover:underline"
              >
                <span className="tabular">{r.reference}</span> · {r.title || "Untitled listing"}
              </Link>
            </li>
          ))}
          {created.length > 50 && (
            <li className="text-text-muted">and {created.length - 50} more</li>
          )}
        </ul>
      )}
      {failed.length > 0 && (
        <ul className="flex flex-col gap-1 text-[13px] text-danger" aria-label="Rows not imported">
          {failed.map((r) => (
            <li key={r.line}>
              Line {r.line}: {r.ok ? "" : r.errors.join(" ")}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/admin/properties?status=draft">See the drafts</Link>
        </Button>
        <Button type="button" variant="outline" onClick={onAgain}>
          Import another file
        </Button>
      </div>
    </FormSection>
  );
}
