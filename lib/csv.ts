/**
 * CSV (RFC 4180) for listing import and export (07 §7). Runs in the browser and on the server.
 * - Quoted fields may hold commas, quotes (doubled) and line breaks; CRLF, LF or CR end a row.
 * - A leading UTF-8 BOM is ignored; the delimiter is a comma, semicolon or tab (Excel in many
 *   locales saves with semicolons), detected from the first line.
 * - Text that a spreadsheet would run as a formula (=, +, -, @) is written with a leading
 *   apostrophe, and read back without it (OWASP "CSV injection").
 */

export class CsvError extends Error {
  constructor(
    message: string,
    public readonly line: number,
  ) {
    super(message);
    this.name = "CsvError";
  }
}

export type Delimiter = "," | ";" | "\t";

const BOM = "﻿";

/** The delimiter used most often outside quotes on the first line (comma when unsure). */
export function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === "\n" || c === "\r")) break;
    else if (!quoted && (c === "," || c === ";" || c === "\t")) counts[c]++;
  }
  const best = (Object.keys(counts) as Delimiter[]).sort((a, b) => counts[b] - counts[a])[0]!;
  return counts[best] > 0 ? best : ",";
}

const FORMULA_START = /^[=+\-@\t\r]/;

/** Reads a cell as written by `toCsv` (drops the formula guard apostrophe). */
function unguard(value: string): string {
  return value.startsWith("'") && FORMULA_START.test(value.slice(1)) ? value.slice(1) : value;
}

/**
 * Rows of cells. Blank lines are skipped; cells are not trimmed (callers decide).
 * Throws CsvError when a quoted cell never closes.
 */
export function parseCsv(input: string, delimiter?: Delimiter): string[][] {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const sep = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let cellWasQuoted = false;
  let line = 1;
  let quoteLine = 1;

  const endCell = () => {
    row.push(unguard(cell));
    cell = "";
    cellWasQuoted = false;
  };
  const endRow = () => {
    endCell();
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (c === "\n" || (c === "\r" && text[i + 1] !== "\n")) line++;
        cell += c;
      }
      continue;
    }
    if (c === '"' && cell === "" && !cellWasQuoted) {
      quoted = true;
      cellWasQuoted = true;
      quoteLine = line;
    } else if (c === sep) {
      endCell();
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
    } else {
      cell += c;
    }
  }
  if (quoted) throw new CsvError(`Line ${quoteLine} has a quote that never closes.`, quoteLine);
  if (cell !== "" || cellWasQuoted || row.length > 0) endRow();
  return rows;
}

export type CsvValue = string | number | boolean | null | undefined;

function serializeCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n;\t]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV text with CRLF line ends; `bom` helps Excel open UTF-8 files correctly. */
export function toCsv(rows: CsvValue[][], options: { bom?: boolean } = {}): string {
  const body = rows.map((r) => r.map(serializeCell).join(",")).join("\r\n");
  return `${options.bom ? BOM : ""}${body}\r\n`;
}
