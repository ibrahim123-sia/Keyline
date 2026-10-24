import "server-only";
import type { DbOrTx } from "@/db/client";
import type { ReportContext } from "./types";

/**
 * AI suggestion cards on the dashboard (10 §3 "suggests next steps"). The dashboard renders
 * whatever this returns, in its "Suggestions" column, and nothing while it is empty.
 *
 * Extension point for the AI layer: return cards here (e.g. "3 hot leads have no viewing
 * yet", "HD-1007 has had no inquiries in 30 days"). Any action a card offers must go through
 * the admin assistant's confirm flow (01 §1.8); a card itself only links somewhere.
 */
export type DashboardSuggestion = {
  id: string;
  title: string;
  body: string;
  /** An admin address the card opens (a lead, a listing, a filtered list). */
  href?: string;
  actionLabel?: string;
  tone?: "info" | "warning";
};

export async function loadDashboardSuggestions(
  _db: DbOrTx,
  _ctx: ReportContext,
): Promise<DashboardSuggestion[]> {
  return [];
}
