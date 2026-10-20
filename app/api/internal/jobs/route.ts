import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { jobRuns } from "@/db/schema/system";
import { runJob } from "@/jobs/runner";
import { isInternalRequest, unauthorized } from "@/lib/internal-auth";

const bodySchema = z.object({ id: z.uuid() }).strict();

/** Queue consumer target: runs one job and tells the Worker whether to ack or retry. */
export async function POST(request: Request): Promise<Response> {
  if (!isInternalRequest(request)) return unauthorized();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });

  const outcome = await runJob(parsed.data.id);
  let retryAfterSeconds: number | undefined;
  if (outcome === "retry") {
    const db = await getDb();
    const [row] = await db
      .select({ runAfter: jobRuns.runAfter })
      .from(jobRuns)
      .where(eq(jobRuns.id, parsed.data.id))
      .limit(1);
    retryAfterSeconds = row
      ? Math.max(1, Math.ceil((row.runAfter.getTime() - Date.now()) / 1000))
      : 60;
  }
  return Response.json({ outcome, retryAfterSeconds });
}
