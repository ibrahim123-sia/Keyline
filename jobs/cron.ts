import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { jobRuns } from "@/db/schema/system";
import { cleanupStaleUploads } from "@/features/media/maintenance";
import { recountAllMediaUsage } from "@/features/media/usage";
import { refreshStalePois, refreshStaleProjectPois } from "@/features/pois/distances";
import { dailyListingMaintenance } from "@/features/properties/maintenance";
import { loadSettings } from "@/features/settings/queries";
import { newId } from "@/lib/ids";
import { purgeExpired } from "@/lib/rate-limit";
import { requeueStuckJobs, runDueJobs } from "./runner";

/**
 * Scheduled work (13-integrations-and-jobs.md §2 "Cron jobs"). Cloudflare fires one trigger
 * every minute; each task says when it is due in the agency's own time zone, so "daily at
 * 06:00 agency time" works in any market.
 */
export type LocalTime = { hour: number; minute: number; weekday: number; day: number };

export type CronTask = {
  name: string;
  /** When it runs, for the System page ("every minute", "daily at 02:00"). */
  schedule: string;
  due: (t: LocalTime) => boolean;
  run: () => Promise<unknown>;
};

export const at =
  (hour: number, minute = 0) =>
  (t: LocalTime) =>
    t.hour === hour && t.minute === minute;
export const every = (minutes: number) => (t: LocalTime) =>
  (t.hour * 60 + t.minute) % minutes === 0;

export const cronTasks: CronTask[] = [
  // Every minute: queued jobs whose time has come (retries, delayed jobs, lost messages).
  { name: "jobs.run-due", schedule: "every minute", due: () => true, run: () => runDueJobs() },
  {
    name: "jobs.requeue-stuck",
    schedule: "every 15 minutes",
    due: every(15),
    run: () => requeueStuckJobs(),
  },
  {
    name: "media.cleanup",
    schedule: "every hour",
    due: every(60),
    run: () => cleanupStaleUploads(),
  },
  // Just after midnight: featured dates end, automatic badges start and end (05 §3).
  {
    name: "listings.daily",
    schedule: "daily at 00:15",
    due: at(0, 15),
    run: async () => dailyListingMaintenance(await getDb()),
  },
  // Daily 02:00-03:30: clean-ups and repairs.
  { name: "rate-limits.purge", schedule: "daily at 02:00", due: at(2), run: () => purgeExpired() },
  {
    name: "media.recount",
    schedule: "daily at 03:30",
    due: at(3, 30),
    run: async () => recountAllMediaUsage(await getDb()),
  },
  // Monthly: distances to nearby places older than 90 days are measured again (07 §4.7).
  {
    name: "poi.refresh",
    schedule: "monthly on the 1st at 04:00",
    due: (t) => t.day === 1 && at(4)(t),
    run: async () => {
      const db = await getDb();
      const listings = await refreshStalePois(db);
      const projects = await refreshStaleProjectPois(db);
      return { queued: listings.queued, projects: projects.queued };
    },
  },
];

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localTime(date: Date, timeZone: string): LocalTime {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      day: "numeric",
      hourCycle: "h23",
    }).formatToParts(date);
  } catch {
    return localTime(date, "UTC");
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAYS[get("weekday")] ?? 0,
    day: Number(get("day")),
  };
}

/** Runs the tasks due at `scheduled`; each run is recorded in job_runs for the Jobs page. */
export async function runCron(
  scheduled: Date,
  tasks: CronTask[] = cronTasks,
): Promise<Array<{ task: string; ok: boolean; error?: string }>> {
  const db = await getDb();
  const general = await loadSettings("general", db);
  const t = localTime(scheduled, general.timeZone);
  const results: Array<{ task: string; ok: boolean; error?: string }> = [];

  for (const task of tasks.filter((x) => x.due(t))) {
    const id = newId();
    // Every-minute housekeeping is not logged, or the Jobs page would drown in it.
    const logged = task.name !== "jobs.run-due";
    if (logged) {
      await db.insert(jobRuns).values({
        id,
        name: `cron:${task.name}`,
        status: "running",
        attempts: 1,
        maxAttempts: 1,
        startedAt: new Date(),
      });
    }
    try {
      const result = await task.run();
      if (logged) {
        await db
          .update(jobRuns)
          .set({ status: "succeeded", finishedAt: new Date(), result: (result ?? null) as never })
          .where(eq(jobRuns.id, id));
      }
      results.push({ task: task.name, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ level: "error", cron: task.name, error: message }));
      if (logged) {
        await db
          .update(jobRuns)
          .set({ status: "failed", finishedAt: new Date(), lastError: message.slice(0, 2000) })
          .where(eq(jobRuns.id, id));
      }
      results.push({ task: task.name, ok: false, error: message });
    }
  }
  return results;
}
