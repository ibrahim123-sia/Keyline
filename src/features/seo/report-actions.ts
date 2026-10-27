"use server";

import { z } from "zod";
import { enqueue } from "@/jobs/enqueue";
import { adminAction } from "@/lib/actions";
import { CRAWL_JOB } from "./crawl-job";

/** SEO report: run the broken-link check now instead of waiting for the weekly run. */
export const runSeoCheck = adminAction(z.object({}), { write: true }, async () => {
  const id = await enqueue(CRAWL_JOB, {}, { dedupeKey: CRAWL_JOB, maxAttempts: 2 });
  return { queued: id !== null };
});
