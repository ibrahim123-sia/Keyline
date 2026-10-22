import { z } from "zod";
import { CsvError, detectDelimiter, parseCsv } from "@/lib/csv";
import { normalizePath, splitQuery } from "./redirect-path";

export { normalizePath, splitQuery };

export const isExternal = (to: string) => /^https?:\/\//i.test(to);

const SITE_PATH = /^\/(?!\/)[^\s<>"'`]*$/;
const WEB_ADDRESS = /^https?:\/\/[^\s<>"'`]+$/i;
/** Addresses the site itself needs; a redirect there would never be served anyway. */
const RESERVED = /^\/(admin|api|_next|media)(\/|$|\?)/i;

export const redirectTypes = [301, 302] as const;

export const redirectInputSchema = z
  .strictObject({
    fromPath: z
      .string()
      .trim()
      .min(1, "Enter the old address")
      .max(500, "Use at most 500 characters")
      .transform(normalizePath)
      .refine((p) => SITE_PATH.test(p), "Use an address on this site, starting with /")
      .refine((p) => p !== "/", "The home page cannot be redirected")
      .refine((p) => !RESERVED.test(p), "Admin, API and media addresses cannot be redirected"),
    toPath: z
      .string()
      .trim()
      .min(1, "Enter the new address")
      .max(1000, "Use at most 1000 characters")
      .refine(
        (v) => SITE_PATH.test(v) || WEB_ADDRESS.test(v),
        "Use a path like /new-page or a full https:// address",
      )
      .transform((v) => (isExternal(v) ? v : v.length > 1 ? v.replace(/\/+(?=$|\?)/, "") : v)),
    type: z.union([z.literal(301), z.literal(302)]).default(301),
  })
  .superRefine((d, ctx) => {
    if (!isExternal(d.toPath) && normalizePath(d.toPath) === d.fromPath)
      ctx.addIssue({
        code: "custom",
        path: ["toPath"],
        message: "The new address must be different from the old one",
      });
  });

export type RedirectInput = z.input<typeof redirectInputSchema>;
export type RedirectData = z.output<typeof redirectInputSchema>;

export type RedirectFlags = { chain: boolean; loop: boolean; finalTo: string; hops: number };

/**
 * Follows every redirect to where it finally lands. A chain (A -> B -> C) works but costs
 * visitors and search engines an extra hop; a loop (A -> B -> A) never lands.
 */
export function analyzeRedirects(
  edges: Array<{ fromPath: string; toPath: string }>,
): Map<string, RedirectFlags> {
  const next = new Map(edges.map((e) => [e.fromPath, e.toPath]));
  const out = new Map<string, RedirectFlags>();
  for (const e of edges) {
    const seen = new Set([e.fromPath]);
    let to = e.toPath;
    let hops = 0;
    let loop = false;
    for (;;) {
      if (isExternal(to)) break;
      const key = normalizePath(to);
      const onward = next.get(key) ?? next.get(normalizePath(splitQuery(key)[0]));
      if (onward === undefined) break;
      if (seen.has(key) || hops >= 25) {
        loop = true;
        break;
      }
      seen.add(key);
      hops++;
      to = onward;
    }
    out.set(e.fromPath, { chain: hops > 0 && !loop, loop, finalTo: to, hops });
  }
  return out;
}

export const MAX_IMPORT_ROWS = 5000;
const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);

export type CsvRedirectRow = { line: number } & RedirectData;
export type CsvProblem = { line: number; message: string };

/**
 * A redirects CSV: old address, new address, optional type (301 or 302); a header row is
 * recognised and skipped. Rows that do not validate are reported by line.
 */
export function parseRedirectCsv(text: string): { rows: CsvRedirectRow[]; problems: CsvProblem[] } {
  let table: string[][];
  try {
    table = parseCsv(text, detectDelimiter(text));
  } catch (err) {
    const message = err instanceof CsvError ? err.message : "This file could not be read as CSV.";
    return { rows: [], problems: [{ line: 1, message }] };
  }
  // Blank lines are not rows: map rows back to the file's line numbers for the messages.
  const lines = text.replace(BOM, "").split(/\r\n|\r|\n/);
  const filled = lines.flatMap((l, i) => (l === "" ? [] : [i + 1]));
  const lineOf = (i: number) => (filled.length === table.length ? filled[i]! : i + 1);
  const rows: CsvRedirectRow[] = [];
  const problems: CsvProblem[] = [];
  const seen = new Map<string, number>();
  let tooMany = false;
  table.forEach((cells, i) => {
    const line = lineOf(i);
    const [from = "", to = "", type = ""] = cells.map((c) => c.trim());
    if (!from && !to && !type) return;
    // A first row that is not an address is a header ("from,to,type").
    if (i === 0 && !from.startsWith("/") && !isExternal(from)) return;
    if (rows.length >= MAX_IMPORT_ROWS) {
      if (!tooMany)
        problems.push({
          line,
          message: `Too many rows: import at most ${MAX_IMPORT_ROWS} at a time`,
        });
      tooMany = true;
      return;
    }
    const kind = type === "" ? 301 : Number(type);
    if (kind !== 301 && kind !== 302) {
      problems.push({ line, message: `Type must be 301 or 302, not "${type}"` });
      return;
    }
    const res = redirectInputSchema.safeParse({ fromPath: from, toPath: to, type: kind });
    if (!res.success) {
      problems.push({ line, message: res.error.issues[0]?.message ?? "Not a valid redirect" });
      return;
    }
    const earlier = seen.get(res.data.fromPath);
    if (earlier) {
      problems.push({ line, message: `Same old address as line ${earlier}` });
      return;
    }
    seen.set(res.data.fromPath, line);
    rows.push({ line, ...res.data });
  });
  return { rows, problems };
}
