import "server-only";
import { and, eq, gte, inArray, isNull, lt, gt, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { currentAgencyId } from "@/db/schema/_common";
import { agentAvailabilityOverrides, viewings } from "@/db/schema/crm";
import { agents } from "@/db/schema/people";
import { storedBusy } from "@/features/integrations/google-calendar/calendar";
import { loadSettings } from "@/features/settings/queries";
import { freeSlots, zonedDate, type Interval, type SlotRules } from "./slots";

/** Viewings that hold their time (a cancelled or finished one frees it). */
export const holdingStatuses = ["requested", "confirmed"] as const;

/** The booking rules for an agent (their hours, or the agency's) from Settings -> Viewings. */
export async function slotRulesFor(db: DbOrTx, agentId: string | null): Promise<SlotRules> {
  const [settings, general] = [
    await loadSettings("viewings", db),
    await loadSettings("general", db),
  ];
  const [agent] = agentId
    ? await db
        .select({ workingHours: agents.workingHours })
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.agencyId, currentAgencyId())))
    : [];
  const today = zonedDate(new Date(), general.timeZone);
  const overrides = agentId
    ? await db
        .select({
          date: agentAvailabilityOverrides.date,
          blocked: agentAvailabilityOverrides.blocked,
          hours: agentAvailabilityOverrides.hours,
        })
        .from(agentAvailabilityOverrides)
        .where(
          and(
            eq(agentAvailabilityOverrides.agentId, agentId),
            gte(agentAvailabilityOverrides.date, today),
          ),
        )
    : [];
  return {
    timeZone: general.timeZone,
    workingHours: agent?.workingHours ?? settings.workingHours,
    lengthMin: settings.defaultLengthMin,
    bufferMin: settings.bufferMin,
    minNoticeHours: settings.minNoticeHours,
    bookingWindowDays: settings.bookingWindowDays,
    holidays: settings.holidays,
    overrides,
  };
}

/** The agent's held viewings and calendar busy times between two instants. */
export async function busyTimes(
  db: DbOrTx,
  agentId: string | null,
  from: Date,
  to: Date,
  exceptViewingId?: string,
): Promise<Interval[]> {
  const conditions: SQL[] = [
    eq(viewings.agencyId, currentAgencyId()),
    inArray(viewings.status, [...holdingStatuses]),
    lt(viewings.startsAt, to),
    gt(viewings.endsAt, from),
    agentId ? eq(viewings.agentId, agentId) : isNull(viewings.agentId),
  ];
  const rows = await db
    .select({ id: viewings.id, start: viewings.startsAt, end: viewings.endsAt })
    .from(viewings)
    .where(and(...conditions));
  const held = rows
    .filter((r) => r.id !== exceptViewingId)
    .map(({ start, end }) => ({ start, end }));
  // Busy times read from the agent's connected calendar (refreshed every 15 minutes).
  return agentId ? [...held, ...(await storedBusy(db, agentId, from, to))] : held;
}

/** Free slots for an agent over the booking window (09 §5). */
export async function availableSlots(
  db: DbOrTx,
  agentId: string | null,
  now = new Date(),
  exceptViewingId?: string,
): Promise<{ rules: SlotRules; slots: Interval[] }> {
  const rules = await slotRulesFor(db, agentId);
  const to = new Date(now.getTime() + (rules.bookingWindowDays + 1) * 86_400_000);
  const busy = await busyTimes(db, agentId, now, to, exceptViewingId);
  return { rules, slots: freeSlots(rules, busy, now) };
}
