"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { adminAction } from "@/lib/actions";
import { disconnectCalendar, refreshCalendarBusy } from "./calendar";

/** Setup -> Agents: stop using an agent's Google Calendar (the grant is revoked at Google). */
export const disconnectAgentCalendar = adminAction(
  z.object({ agentId: z.uuid() }),
  { write: true },
  async ({ agentId }, ctx) => {
    const db = await getDb();
    await db.transaction((tx) => disconnectCalendar(tx, agentId, ctx.actor));
    return { agentId };
  },
);

/** "Refresh busy times now" (the cron does it every 15 minutes). */
export const refreshAgentCalendars = adminAction(z.object({}), { write: true }, async () => ({
  refreshed: await refreshCalendarBusy(await getDb()),
}));
