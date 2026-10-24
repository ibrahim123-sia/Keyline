import "server-only";
import { toCsv, type CsvValue } from "@/lib/csv";
import { format } from "@/lib/i18n";
import { reports as t } from "@/lib/i18n/dictionaries/reports";
import { csvUnit, csvValue, formatChange, formatValue } from "./format";
import type { ReportContext, ReportData, ReportRow, ReportTable } from "./types";

/**
 * Report exports (09 §7 "Export any report to CSV and PDF"). Both are built from the same
 * `ReportData` as the screen. Reports hold counts per source, listing and agent profile only:
 * no lead's name, email or phone is ever in a report export.
 */

function csvRows(table: ReportTable, ctx: ReportContext): CsvValue[][] {
  const cur = ctx.currency;
  const header = table.columns.map((c) => `${c.label}${csvUnit(c.format, cur)}`);
  // A table of mixed metrics (key numbers) keeps plain numbers without one unit per column.
  const mixed = table.rows.some((r) => r.formats);
  const line = (r: ReportRow) =>
    table.columns.map((c) => {
      const fmt = r.formats?.[c.key] ?? c.format;
      const v = r.cells[c.key] ?? null;
      return mixed && r.formats?.[c.key] ? formatValue(v, fmt, cur) : csvValue(v, fmt, cur);
    });
  return [
    [table.title],
    mixed ? table.columns.map((c) => c.label) : header,
    ...table.rows.map(line),
    ...(table.total ? [line(table.total)] : []),
  ];
}

export function reportCsv(data: ReportData, ctx: ReportContext): string {
  const p = data.period;
  const rows: CsvValue[][] = [
    [data.title],
    [format(t.period.range, { from: p.from, to: p.to }), ctx.timeZone],
  ];
  if (data.emptyState) rows.push([], [data.emptyState.title]);
  // Tiles that are not in a table already (the overview has its own key numbers table).
  if (data.kpis.length && !data.tables.some((tb) => tb.id === "kpis")) {
    rows.push([]);
    for (const k of data.kpis) rows.push([k.label, formatValue(k.value, k.format, ctx.currency)]);
  }
  for (const table of data.tables) rows.push([], ...csvRows(table, ctx));
  return toCsv(rows, { bom: true });
}

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export type PdfBrand = {
  agencyName: string;
  logoUrl: string | null;
  colors: {
    bg: string;
    surface: string;
    ink: string;
    text: string;
    textMuted: string;
    border: string;
    accent: string;
  };
};

/**
 * A printable report page: agency name or logo, the period, key numbers as tiles, then every
 * table, and how the numbers are counted. Colours are the agency's branding tokens; inline
 * styles only (rendered by headless Chromium, `lib/pdf/render.ts`).
 */
export function reportHtml(data: ReportData, ctx: ReportContext, brand: PdfBrand): string {
  const c = brand.colors;
  const cur = ctx.currency;
  const p = data.period;
  const cell = (r: ReportRow, key: string, fmt: Parameters<typeof formatValue>[1]) =>
    escape(formatValue(r.cells[key] ?? null, r.formats?.[key] ?? fmt, cur));
  const tableHtml = (tb: ReportTable) => {
    const head = tb.columns
      .map((col, i) => `<th class="${i ? "num" : ""}">${escape(col.label)}</th>`)
      .join("");
    const body = tb.rows.length
      ? tb.rows
          .map(
            (r) =>
              `<tr>${tb.columns
                .map(
                  (col, i) => `<td class="${i ? "num" : ""}">${cell(r, col.key, col.format)}</td>`,
                )
                .join("")}</tr>`,
          )
          .join("")
      : `<tr><td colspan="${tb.columns.length}" class="empty">${escape(tb.empty)}</td></tr>`;
    const foot = tb.total
      ? `<tfoot><tr>${tb.columns
          .map(
            (col, i) =>
              `<td class="${i ? "num" : ""}">${cell(tb.total!, col.key, col.format)}</td>`,
          )
          .join("")}</tr></tfoot>`
      : "";
    return `<section><h2>${escape(tb.title)}</h2>${
      tb.description ? `<p class="muted">${escape(tb.description)}</p>` : ""
    }<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></section>`;
  };
  const tiles = data.kpis
    .map(
      (k) =>
        `<div class="tile"><div class="label">${escape(k.label)}</div><div class="value">${escape(
          formatValue(k.value, k.format, cur),
        )}</div>${
          k.change
            ? `<div class="muted">${escape(formatChange(k.change, k.format, cur))} ${escape(
                t.kpis.vsPrevious,
              )}</div>`
            : ""
        }</div>`,
    )
    .join("");
  const header = brand.logoUrl
    ? `<img src="${escape(brand.logoUrl)}" alt="${escape(brand.agencyName)}" style="max-height:40px">`
    : `<div class="agency">${escape(brand.agencyName)}</div>`;
  const generated = format(t.export.generated, {
    date: ctx.today,
    timeZone: ctx.timeZone,
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(
    `${data.title} · ${brand.agencyName}`,
  )}</title><style>
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Manrope, "Helvetica Neue", Arial, sans-serif; font-size: 11px; color: ${c.text}; background: #fff; }
    header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid ${c.accent}; padding-bottom: 10px; margin-bottom: 16px; }
    .agency { font-size: 16px; font-weight: 700; color: ${c.ink}; }
    h1 { font-size: 20px; margin: 0 0 2px; color: ${c.ink}; }
    h2 { font-size: 13px; margin: 18px 0 6px; color: ${c.ink}; }
    .muted { color: ${c.textMuted}; }
    .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .tile { border: 1px solid ${c.border}; border-radius: 8px; padding: 8px 10px; break-inside: avoid; }
    .tile .label { color: ${c.textMuted}; font-size: 10px; }
    .tile .value { color: ${c.ink}; font-size: 16px; font-weight: 700; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; color: ${c.textMuted}; border-bottom: 1px solid ${c.border}; padding: 4px 6px; }
    td { border-bottom: 1px solid ${c.border}; padding: 4px 6px; color: ${c.ink}; }
    tr { break-inside: avoid; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    tfoot td { font-weight: 700; }
    .empty { text-align: center; color: ${c.textMuted}; padding: 12px; }
    footer { margin-top: 20px; border-top: 1px solid ${c.border}; padding-top: 8px; font-size: 9.5px; color: ${c.textMuted}; }
    footer li { margin: 2px 0; }
  </style></head><body>
    <header><div>${header}</div><div class="muted" style="text-align:right">${escape(generated)}</div></header>
    <h1>${escape(data.title)}</h1>
    <p class="muted">${escape(format(t.period.range, { from: p.from, to: p.to }))} · ${escape(
      format(t.period.comparedWith, { from: p.previous.from, to: p.previous.to }),
    )}</p>
    ${data.emptyState ? `<h2>${escape(data.emptyState.title)}</h2><p>${escape(data.emptyState.description)}</p>` : ""}
    ${tiles ? `<div class="tiles">${tiles}</div>` : ""}
    ${data.tables.map(tableHtml).join("")}
    <footer><ul>${data.notes.map((n) => `<li>${escape(n)}</li>`).join("")}</ul><div>${escape(
      t.export.madeWith,
    )}</div></footer>
  </body></html>`;
}
