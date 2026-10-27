import type { WorkingHours } from "@/db/schema/people";

/**
 * Free viewing slots (09 §5): the agent's working hours (or the agency's) on each day of the
 * booking window, minus holidays, days off and other hours, the minimum notice, and existing
 * viewings and calendar busy times with the buffer around them. Times are worked out in the
 * agency's time zone, daylight saving included. Pure: no database, no clock.
 */

export type DayOverride = {
  /** YYYY-MM-DD in the agency's time zone. */
  date: string;
  blocked: boolean;
  /** When not blocked: that day's hours instead of the usual ones. */
  hours?: Array<{ from: string; to: string }> | null;
};

export type SlotRules = {
  timeZone: string;
  workingHours: WorkingHours;
  lengthMin: number;
  bufferMin: number;
  minNoticeHours: number;
  bookingWindowDays: number;
  /** Agency holidays, YYYY-MM-DD. */
  holidays: readonly string[];
  overrides: readonly DayOverride[];
  /** Start times every N minutes (default 30). */
  stepMin?: number;
};

export type Interval = { start: Date; end: Date };

const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** The time zone's offset from UTC (minutes) at an instant. */
function offsetMinutes(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(at / 60_000) * 60_000) / 60_000);
}

/**
 * The instant of a wall-clock time in a time zone. A time that does not exist (the hour
 * skipped when clocks go forward) moves forward with the clocks.
 */
export function zonedTime(date: string, minutes: number, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const wall = Date.UTC(y!, mo! - 1, d!, 0, minutes);
  let guess = wall - offsetMinutes(wall, timeZone) * 60_000;
  // Second pass: the offset at the guessed instant can differ around a change.
  guess = wall - offsetMinutes(guess, timeZone) * 60_000;
  return new Date(guess);
}

/** The calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function zonedDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

export function freeSlots(rules: SlotRules, busy: readonly Interval[], now: Date): Interval[] {
  const step = rules.stepMin ?? 30;
  const lengthMs = rules.lengthMin * 60_000;
  const bufferMs = rules.bufferMin * 60_000;
  const earliest = now.getTime() + rules.minNoticeHours * 3_600_000;
  // A viewing needs its buffer clear on both sides of every busy time.
  const blocked = busy.map((b) => ({
    start: new Date(b.start.getTime() - bufferMs),
    end: new Date(b.end.getTime() + bufferMs),
  }));
  const holidays = new Set(rules.holidays);
  const overrides = new Map(rules.overrides.map((o) => [o.date, o]));
  const today = zonedDate(now, rules.timeZone);
  const slots: Interval[] = [];

  for (let i = 0; i <= rules.bookingWindowDays; i++) {
    const date = addDays(today, i);
    if (holidays.has(date)) continue;
    const override = overrides.get(date);
    if (override?.blocked) continue;
    const [y, m, d] = date.split("-").map(Number);
    const weekday = weekdays[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
    const ranges: Array<[number, number]> = override?.hours
      ? override.hours.map((r) => [minutesOf(r.from), minutesOf(r.to)])
      : (rules.workingHours[weekday] ?? []).map(([from, to]) => [minutesOf(from), minutesOf(to)]);

    for (const [from, to] of ranges)
      for (let t = from; t + rules.lengthMin <= to; t += step) {
        const start = zonedTime(date, t, rules.timeZone);
        if (start.getTime() < earliest) continue;
        const slot = { start, end: new Date(start.getTime() + lengthMs) };
        if (blocked.some((b) => overlaps(slot, b))) continue;
        // Skipped wall-clock times can map onto a slot already listed.
        if (slots.some((s) => s.start.getTime() === start.getTime())) continue;
        slots.push(slot);
      }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Is this exact start still free? (checked again on the server when a visitor books.) */
export function isFreeSlot(
  rules: SlotRules,
  busy: readonly Interval[],
  now: Date,
  start: Date,
): boolean {
  return freeSlots(rules, busy, now).some((s) => s.start.getTime() === start.getTime());
}
