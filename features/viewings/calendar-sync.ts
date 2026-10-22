import "server-only";
import type { DbOrTx } from "@/db/client";
import { enqueue } from "@/jobs/enqueue";

/**
 * The agent's Google Calendar follows the viewing (calendar.sync reads its latest state, so a
 * run per change is safe; it does nothing when the agent's calendar is not connected).
 */
export async function queueCalendarSync(db: DbOrTx, viewingId: string): Promise<void> {
  await enqueue(
    "calendar.sync",
    { viewingId },
    { db, dedupeKey: `calendar.sync:${viewingId}:${Date.now()}` },
  );
}
