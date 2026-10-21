import "server-only";
import { z } from "zod";
import { siteOrigin } from "@/features/site/url";
import { isWorkersRuntime } from "@/lib/env";
import { defineJob } from "@/jobs/types";
import { crawlSite, type CrawlFetch } from "./crawl";

export const CRAWL_JOB = "seo.crawl";

/** On Workers the site is reached through its own service binding; elsewhere over HTTP. */
async function siteFetcher(): Promise<CrawlFetch> {
  if (isWorkersRuntime()) {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const self = (env as { WORKER_SELF_REFERENCE?: { fetch: CrawlFetch } }).WORKER_SELF_REFERENCE;
    if (self) return (url, init) => self.fetch(url, init);
  }
  return (url, init) => fetch(url, init);
}

/** The weekly broken-link check (13 §2 jobs); its result feeds the SEO report. */
export const seoCrawlJob = defineJob({
  name: CRAWL_JOB,
  payload: z.object({}).strict(),
  maxAttempts: 2,
  run: async () => crawlSite({ origin: siteOrigin(), fetch: await siteFetcher() }),
});
