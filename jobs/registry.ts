import { leadProcessJob, leadScoreJob } from "@/features/leads/process";
import { mediaFetchUrlJob } from "@/features/media/fetch-url";
import { mediaProcessJob } from "@/features/media/process";
import { emailSendJob } from "@/features/notifications/email";
import { poiComputeJob, projectPoiComputeJob } from "@/features/pois/distances";
import { viewingNotifyJob } from "@/features/viewings/notify";
import type { JobDefinition } from "./types";

/** Every queue job by name (13-integrations-and-jobs.md §2). */
const jobs: JobDefinition[] = [
  emailSendJob as JobDefinition,
  leadProcessJob as JobDefinition,
  leadScoreJob as JobDefinition,
  mediaProcessJob as JobDefinition,
  mediaFetchUrlJob as JobDefinition,
  poiComputeJob as JobDefinition,
  projectPoiComputeJob as JobDefinition,
  viewingNotifyJob as JobDefinition,
];

const byName = new Map(jobs.map((j) => [j.name, j]));

export function getJob(name: string): JobDefinition | undefined {
  return byName.get(name);
}

export function jobNames(): string[] {
  return [...byName.keys()].sort();
}
