import "server-only";
import type { DbOrTx } from "@/db/client";
import { enqueue } from "@/jobs/enqueue";

/**
 * The agent's Google Calendar follows the viewing (calendar.sync reads its latest state, so a
 * run per change is safe; it does nothing when the agent's calendar is not connected).
 * `previous` is the agent and event to remove when the viewing moved to another agent.
 */
export async function queueCalendarSync(
  db: DbOrTx,
  viewingId: string,
  previous?: { agentId: string; eventId: string } | null,
): Promise<void> {
  await enqueue(
    "calendar.sync",
    { viewingId, previous: previous ?? null },
    { db, dedupeKey: `calendar.sync:${viewingId}:${Date.now()}` },
  );
}
