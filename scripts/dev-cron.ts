import "./_env";

/**
 * `pnpm dev:cron` — local stand-in for the Worker's every-minute cron trigger.
 * Calls /api/internal/cron on the running dev server once a minute.
 */
const base = (process.argv[2] ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.INTERNAL_JOB_SECRET;
if (!secret) {
  console.error("INTERNAL_JOB_SECRET is not set (see .env.example)");
  process.exit(1);
}

async function tick() {
  const scheduledTime = Math.floor(Date.now() / 60_000) * 60_000;
  try {
    const res = await fetch(`${base}/api/internal/cron`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ scheduledTime }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      results?: Array<{ task: string; ok: boolean }>;
    };
    const ran = (body.results ?? []).map((r) => `${r.task}${r.ok ? "" : " (failed)"}`).join(", ");
    console.log(`[cron] ${new Date(scheduledTime).toISOString()} ${res.status} ${ran}`);
  } catch (err) {
    console.error(`[cron] ${base} unreachable:`, (err as Error).message);
  }
}

console.log(`[cron] calling ${base}/api/internal/cron every minute. Ctrl+C to stop.`);
await tick();
const msToNextMinute = 60_000 - (Date.now() % 60_000);
setTimeout(() => {
  void tick();
  setInterval(() => void tick(), 60_000);
}, msToNextMinute);
