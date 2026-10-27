import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { leads } from "@/db/schema/crm";

/**
 * The first real reply to a lead (a person or the AI in conversation, 09 §3.8): stops the
 * response timer and fixes the response time. Later replies change nothing.
 */
export async function markFirstResponse(db: DbOrTx, leadId: string, at: Date): Promise<boolean> {
  const updated = await db
    .update(leads)
    .set({ firstResponseAt: at, responseDueAt: null })
    .where(and(eq(leads.id, leadId), isNull(leads.firstResponseAt)))
    .returning({ id: leads.id });
  return updated.length > 0;
}
