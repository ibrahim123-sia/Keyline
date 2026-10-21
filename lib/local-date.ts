/** The calendar date ("2026-10-21") of a moment in a time zone; UTC when the zone is unknown. */
export function localDateString(date: Date, timeZone: string): string {
  const format = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  try {
    return format(timeZone);
  } catch {
    return format("UTC");
  }
}
