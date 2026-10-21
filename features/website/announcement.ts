import type { AnnouncementSettings } from "@/features/settings/schema";

export type AnnouncementState = "off" | "scheduled" | "live" | "ended";

/**
 * Whether the bar shows at `now`, and when that next changes (its start or end), so the
 * cached site shell can refresh right then.
 */
export function announcementWindow(
  a: AnnouncementSettings,
  now: number,
): { state: AnnouncementState; nextChange: number | null } {
  if (!a.enabled || !a.text) return { state: "off", nextChange: null };
  const start = a.startsAt ? Date.parse(a.startsAt) : null;
  const end = a.endsAt ? Date.parse(a.endsAt) : null;
  if (end !== null && now >= end) return { state: "ended", nextChange: null };
  if (start !== null && now < start) return { state: "scheduled", nextChange: start };
  return { state: "live", nextChange: end };
}

/** Seconds until the next change, kept between one minute and thirty days. */
export function secondsUntil(next: number, now: number): number {
  return Math.min(30 * 86_400, Math.max(60, Math.ceil((next - now) / 1000)));
}
