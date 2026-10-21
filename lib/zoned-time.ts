/**
 * Wall-clock times in the agency's time zone (General -> Time zone) for date-time inputs,
 * without a date library: Intl does the zone maths, including daylight saving.
 */

function partsIn(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Minutes the zone is ahead of UTC at that instant. */
function offsetMinutes(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "2026-10-21T09:30" in `timeZone` -> an ISO instant ("…Z"); null when not a valid input. */
export function wallTimeToIso(local: string, timeZone: string): string | null {
  const m = WALL.exec(local);
  if (!m) return null;
  const wall = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  if (Number.isNaN(wall)) return null;
  // Two passes settle the offset on either side of a daylight-saving change.
  let ts = wall - offsetMinutes(new Date(wall), timeZone) * 60_000;
  ts = wall - offsetMinutes(new Date(ts), timeZone) * 60_000;
  return new Date(ts).toISOString();
}

/** An ISO instant as "YYYY-MM-DDTHH:mm" in `timeZone` (the value of a datetime-local input). */
export function isoToWallTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const p = partsIn(date, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
