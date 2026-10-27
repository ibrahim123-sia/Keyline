import { z } from "zod";
import { runCron } from "@/jobs/cron";
import { isInternalRequest, unauthorized } from "@/lib/internal-auth";

const bodySchema = z.object({ scheduledTime: z.number().int().positive().optional() }).strict();

/** Called every minute by the Worker's cron trigger (and by `pnpm dev:cron` locally). */
export async function POST(request: Request): Promise<Response> {
  if (!isInternalRequest(request)) return unauthorized();
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
  const results = await runCron(new Date(parsed.data.scheduledTime ?? Date.now()));
  return Response.json({ results });
}
