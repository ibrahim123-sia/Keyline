"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { redispatch } from "@/jobs/enqueue";
import { retryJobs } from "@/jobs/runner";
import { adminAction } from "@/lib/actions";
import { writeAudit } from "@/lib/audit";

/** Jobs page "Retry" (13 §2): failed and dead runs go back in the queue straight away. */
export const retryJobRuns = adminAction(
  z.object({ ids: z.array(z.uuid()).min(1).max(200) }),
  { write: true },
  async ({ ids }, ctx) => {
    const count = await retryJobs(ids);
    // Runs that were not failed or dead are left alone; dispatching them again is a no-op.
    if (count > 0) await redispatch(ids);
    const db = await getDb();
    await writeAudit(db, {
      actor: ctx.actor,
      action: "jobs.retry",
      entityType: "job",
      after: { ids, retried: count },
    });
    return { count };
  },
);
