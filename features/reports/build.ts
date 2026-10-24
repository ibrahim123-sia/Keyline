import "server-only";
import type { DbOrTx } from "@/db/client";
import { agentsReport } from "./agents";
import { aiReport } from "./ai";
import { loadReportContext } from "./context";
import { funnelReport } from "./funnel";
import { listingsReport, parseListingsParams } from "./listings";
import { overviewReport } from "./overview";
import { parsePeriodParams, periodQuery } from "./period";
import { responseTimeReport } from "./response-time";
import { parseSourcesParams, sourcesReport } from "./sources";
import { reportKeys, type ReportContext, type ReportData, type ReportKey } from "./types";

export type SearchParams = Record<string, string | string[] | undefined>;

export function isReportKey(value: string): value is ReportKey {
  return (reportKeys as readonly string[]).includes(value);
}

/**
 * One report from the URL's search params (period plus the report's own controls). `full`
 * is for exports: tables that are cut short on screen come back whole.
 */
export async function buildReport(
  db: DbOrTx,
  key: ReportKey,
  sp: SearchParams,
  options: { now?: Date; full?: boolean } = {},
): Promise<{ data: ReportData; ctx: ReportContext; query: Record<string, string> }> {
  const ctx = await loadReportContext(db, parsePeriodParams(sp), options.now);
  const query: Record<string, string> = { ...periodQuery(ctx.period) };
  let data: ReportData;
  switch (key) {
    case "overview":
      data = await overviewReport(db, ctx);
      break;
    case "sources": {
      const params = parseSourcesParams(sp);
      Object.assign(query, { by: params.by, touch: params.touch });
      data = await sourcesReport(db, ctx, params);
      break;
    }
    case "funnel":
      data = await funnelReport(db, ctx);
      break;
    case "response-time":
      data = await responseTimeReport(db, ctx);
      break;
    case "listings": {
      const params = parseListingsParams(sp);
      Object.assign(query, { verified: String(params.verified), quiet: String(params.quiet) });
      data = await listingsReport(db, ctx, params, { full: options.full });
      break;
    }
    case "agents":
      data = await agentsReport(db, ctx);
      break;
    case "ai":
      data = await aiReport(db, ctx);
      break;
  }
  return { data, ctx, query };
}

/** The admin address of a report with the given params. */
export function reportHref(key: ReportKey, query: Record<string, string>): string {
  const qs = new URLSearchParams(query).toString();
  const path = key === "overview" ? "/admin/reports" : `/admin/reports/${key}`;
  return qs ? `${path}?${qs}` : path;
}

export function exportHref(
  key: ReportKey,
  format: "csv" | "pdf",
  query: Record<string, string>,
): string {
  return `/api/admin/reports/${key}?${new URLSearchParams({ ...query, format }).toString()}`;
}
